const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const Attendee = require('./models/attendee');

const PORT = process.env.PORT || 3000;
const JWT_SECRET =process.env.JWT_SECRET || 'change-this-secret-before-deploying';
const STAFF_PASSWORD =process.env.STAFF_PASSWORD || 'Tractrac0';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));


// =====================================================
// MONGODB MODEL - EVENT META
// =====================================================

const eventMetaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Year 2 Learning Event'
    },

    date: {
      type: String,
      default: ''
    },

    capacity: {
      type: Number,
      default: 170
    }
  },
  {
    timestamps: true
  }
);

const EventMeta =
  mongoose.models.EventMeta ||
  mongoose.model('EventMeta', eventMetaSchema);


// =====================================================
// HELPERS
// =====================================================

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// =====================================================
// EVENT META HELPERS
// =====================================================

async function getMeta() {
  let meta = await EventMeta.findOne().lean();

  if (!meta) {
    const created = await EventMeta.create({
      name: 'Year 2 Learning Event',
      date: '',
      capacity: 170
    });

    return created.toObject();
  }

  return meta;
}

async function updateMeta(values) {
  return EventMeta.findOneAndUpdate(
    {},
    {
      $set: values
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  ).lean();
}


// =====================================================
// STATS
// =====================================================

async function computeStats() {
  const [totalAttendees, checkedInCount] = await Promise.all([
    Attendee.countDocuments(),

    Attendee.countDocuments({
      checkedIn: true
    })
  ]);

  return {
    totalAttendees,
    checkedInCount,
    notCheckedInCount: totalAttendees - checkedInCount
  };
}


// =====================================================
// AUTH
// =====================================================

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized staff access'
    });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: 'Unauthorized staff access'
    });
  }
}


// =====================================================
// STAFF LOGIN
// =====================================================

app.post('/api/staff/login', (req, res) => {
  const { password } = req.body || {};

  if (password !== STAFF_PASSWORD) {
    return res.status(401).json({
      error: 'Incorrect password'
    });
  }

  const token = jwt.sign(
    {
      role: 'staff'
    },
    JWT_SECRET,
    {
      expiresIn: '12h'
    }
  );

  res.json({
    token
  });
});


// =====================================================
// EVENT META
// =====================================================

app.get('/api/staff/meta', requireAuth, async (req, res) => {
  try {
    res.json(await getMeta());
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load event details.'
    });
  }
});

// Resolve Nigerian bank account using Paystack
app.get('/api/staff/banks/resolve', requireAuth, async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.query;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        error: 'Account number and bank code are required'
      });
    }

    const cleanAccountNumber = String(accountNumber).replace(/\D/g, '');

    if (cleanAccountNumber.length !== 10) {
      return res.status(400).json({
        error: 'Account number must be 10 digits'
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      console.error('PAYSTACK_SECRET_KEY is missing from .env');

      return res.status(500).json({
        error: 'Paystack is not configured on the server'
      });
    }

    const paystackUrl =
      `https://api.paystack.co/bank/resolve` +
      `?account_number=${encodeURIComponent(cleanAccountNumber)}` +
      `&bank_code=${encodeURIComponent(bankCode)}`;

    const response = await fetch(paystackUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json'
      }
    });

    const data = await response.json();

    console.log('Paystack response:', data);

    if (!response.ok || !data.status) {
     const safeStatus = response.status === 401 || response.status === 403 ? 502 : (response.status || 400);
  return res.status(safeStatus).json({
    error: data.message || 'Could not verify this account number'
  });
    }

    return res.json({
      accountNumber: data.data.account_number,
      accountName: data.data.account_name
    });

  } catch (error) {
    console.error('Paystack bank verification error:', error);

    return res.status(500).json({
      error: 'Unable to connect to Paystack'
    });
  }
});


app.put('/api/staff/meta', requireAuth, async (req, res) => {
  try {
    const {
      name,
      date,
      capacity
    } = req.body || {};

    const updates = {};

    if (name !== undefined) {
      updates.name = name;
    }

    if (date !== undefined) {
      updates.date = date;
    }

    if (capacity !== undefined) {
      const cap = parseInt(capacity, 10);

      updates.capacity =
        Number.isNaN(cap) || cap <= 0
          ? 170
          : cap;
    }

    await updateMeta(updates);

    res.json(await getMeta());

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to update event details.'
    });
  }
});


// =====================================================
// GET ATTENDEES
// =====================================================

app.get('/api/staff/attendees', requireAuth, async (req, res) => {
  try {
    const {
      search = '',
      checkedIn
    } = req.query;

    const filter = {};

    if (checkedIn === 'true') {
      filter.checkedIn = true;
    }

    if (checkedIn === 'false') {
      filter.checkedIn = false;
    }

    const q = String(search).trim();

    if (q) {
      const regex = new RegExp(
        escapeRegex(q),
        'i'
      );

      filter.$or = [
        {
          name: regex
        },
        {
          phone: regex
        },
        {
          email: regex
        },
        {
          organization: regex
        }
      ];
    }

    const [
      rows,
      stats
    ] = await Promise.all([
      Attendee
        .find(filter)
        .sort({
          name: 1
        })
        .lean(),

      computeStats()
    ]);

    const items = rows.map(r => {
      const {
        _id,
        signatureData,
        ...rest
      } = r;

      return {
        ...rest,

        id: _id.toString(),

        checkedIn: !!r.checkedIn,

        hasSignature: !!signatureData
      };
    });

    res.json({
      items,
      total: rows.length,
      stats
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load attendees.'
    });
  }
});


// =====================================================
// ADD ATTENDEE
// =====================================================

app.post('/api/staff/attendees', requireAuth, async (req, res) => {
  try {
      const {
        name,
        phone,
        email,
        organization,
        gender,
        disabilityType,
        ageRange,
        state,
        lga,
        designation,
        address,
        bankName,
        bankCode,
        accountNumber,
        accountName,
      } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        error: 'Name and phone are required'
      });
    }

    const meta = await getMeta();

    const total = await Attendee.countDocuments();

    if (total >= meta.capacity) {
      return res.status(400).json({
        error: 'Event capacity has been reached'
      });
    }

    const normalizedPhone = normalizePhone(phone);

    const attendees = await Attendee.find(
      {},
      { phone: 1 }
    ).lean();

    const duplicate = attendees.some(
      attendee => normalizePhone(attendee.phone) === normalizedPhone
    );

    if (duplicate) {
      return res.status(409).json({
        error: 'An attendee with this phone number already exists'
      });
    }

    const attendee = await Attendee.create({
      name,
      phone,
      email: email || '',
      organization: organization || '',
      gender: gender || '',
      disabilityType: disabilityType || '',
      ageRange: ageRange || '',
      state: state || '',
      lga:lga || '',
      designation:designation || '',
      address: address || '',
      bankName: bankName || '',
      bankCode: bankCode || '',
      accountNumber: accountNumber || '',
      accountName: accountName || '',
      signatureData: null,
      checkedIn: false,
      checkedInAt: null,
      checkedOutAt: null,
      addedAt: new Date()
    });

    res.status(201).json({
      id: attendee._id,
      ...attendee.toObject()
    });

  } catch (err) {
    console.error('Add attendee error:', err);

    res.status(500).json({
      error: 'Failed to add attendee'
    });
  }
});

// =====================================================
// UPDATE / CHECK-IN / CHECK-OUT
// =====================================================

app.patch('/api/staff/attendees/:id', requireAuth, async (req, res) => {
  try {
    const attendee = await Attendee.findById(req.params.id);

    if (!attendee) {
      return res.status(404).json({
        error: 'Attendee not found'
      });
    }

   const {
  name,
  phone,
  email,
  organization,
  gender,
  disabilityType,
  ageRange,
  state,
  lga,
  designation,
  address,
  bankName,
  bankCode,
  accountNumber,
  accountName,
  checkedIn,
  signatureData
} = req.body;

if (name !== undefined) attendee.name = name;
if (phone !== undefined) attendee.phone = phone;
if (email !== undefined) attendee.email = email;
if (organization !== undefined) attendee.organization = organization;
if (gender !== undefined) attendee.gender = gender;
if (disabilityType !== undefined) attendee.disabilityType = disabilityType;
if (ageRange !== undefined) attendee.ageRange = ageRange;
if (state !== undefined) attendee.state = state;
if (lga !== undefined) attendee.lga = lga;
if (designation !== undefined) attendee.designation = designation;
if (address !== undefined) attendee.address = address;
if (bankName !== undefined) attendee.bankName = bankName;
if (bankCode !== undefined) attendee.bankCode = bankCode;
if (accountNumber !== undefined) attendee.accountNumber = accountNumber;
if (accountName !== undefined) attendee.accountName = accountName;


    const isCheckingInNow =
      checkedIn === true && attendee.checkedIn !== true;

    if (isCheckingInNow && !signatureData) {
      return res.status(400).json({
        error: 'Signature is required when checking in'
      });
    }

    if (signatureData !== undefined) {
      attendee.signatureData = signatureData;
    }

    if (checkedIn !== undefined) {
      if (checkedIn === true && attendee.checkedIn !== true) {
        attendee.checkedIn = true;
        attendee.checkedInAt = new Date();
        attendee.checkedOutAt = null;
      }

      if (checkedIn === false && attendee.checkedIn === true) {
        attendee.checkedIn = false;
        attendee.checkedOutAt = new Date();
      }
    }

    await attendee.save();

    res.json({
      id: attendee._id,
      ...attendee.toObject()
    });

    }
  catch (err) {
    console.error('Update attendee error:', err);

    res.status(500).json({
      error: 'Failed to update attendee'
    });
  }
});

// =====================================================
// DELETE ATTENDEE
// =====================================================

app.delete(
  '/api/staff/attendees/:id',
  requireAuth,
  async (req, res) => {

    try {

      const deleted =
        await Attendee.findByIdAndDelete(
          req.params.id
        );

      if (!deleted) {
        return res.status(404).json({
          error:
            'Attendee not found.'
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {

      console.error(error);

      if (
        error instanceof mongoose.Error.CastError
      ) {
        return res.status(400).json({
          error:
            'Invalid attendee ID.'
        });
      }

      res.status(500).json({
        error:
          'Failed to delete attendee.'
      });
    }
  }
);


// =====================================================
// BULK DELETE
// =====================================================

app.post(
  '/api/staff/attendees/bulk-delete',
  requireAuth,
  async (req, res) => {

    try {

      const ids =
        Array.isArray(req.body?.ids)
          ? req.body.ids
          : [];

      if (ids.length === 0) {
        return res.json({
          deleted: 0
        });
      }

      const result =
        await Attendee.deleteMany({
          _id: {
            $in: ids
          }
        });

      res.json({
        deleted:
          result.deletedCount
      });

    } catch (error) {

      console.error(error);

      res.status(400).json({
        error:
          'Failed to delete selected attendees.'
      });
    }
  }
);


// =====================================================
// BULK IMPORT
// =====================================================

app.post('/api/staff/attendees/import', requireAuth, async (req, res) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        error: 'rows must be an array'
      });
    }

    const meta = await getMeta();

    const existingAttendees = await Attendee.find(
      {},
      { phone: 1 }
    ).lean();

    const existingPhones = new Set(
      existingAttendees.map(attendee =>
        normalizePhone(attendee.phone)
      )
    );

    const importPhones = new Set();

    const documents = [];

    let duplicates = 0;
    let invalid = 0;

    for (const row of rows) {
      const name = String(row.name || '').trim();
      const phone = String(row.phone || '').trim();

      if (!name || !phone) {
        invalid++;
        continue;
      }

      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        invalid++;
        continue;
      }

      if (
        existingPhones.has(normalizedPhone) ||
        importPhones.has(normalizedPhone)
      ) {
        duplicates++;
        continue;
      }

      importPhones.add(normalizedPhone);

      documents.push({
        name,
        phone,
        email: row.email || '',
        organization: row.organization || '',
        gender: row.gender || '',
        disabilityType: row.disabilityType || '',
        ageRange: row.ageRange || '',
        state: row.state || '',
        lga:row.lga || '',
        designation:row.designation || '',
        address: row.address || '',
        bankName: row.bankName || '',
        bankCode: row.bankCode || '',
        accountNumber: row.accountNumber || '',
        accountName: row.accountName || '',
        signatureData: null,
        checkedIn: false,
        checkedInAt: null,
        checkedOutAt: null,
        addedAt: new Date()
      });
    }

    const currentTotal = await Attendee.countDocuments();

    const availableSlots = Math.max(
      0,
      meta.capacity - currentTotal
    );

    const allowedDocuments = documents.slice(
      0,
      availableSlots
    );

    const overCapacity = Math.max(
      0,
      documents.length - allowedDocuments.length
    );

    let added = 0;

    if (allowedDocuments.length > 0) {
      const inserted = await Attendee.insertMany(
        allowedDocuments
      );

      added = inserted.length;
    }

    res.json({
      added,
      duplicates,
      overCapacity,
      invalid
    });

  } catch (err) {
    console.error('Import attendees error:', err);

    res.status(500).json({
      error: 'Failed to import attendees'
    });
  }
});


// =====================================================
// STATIC FRONTEND
// =====================================================

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.get('*', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});


// =====================================================
// CONNECT TO MONGODB + START SERVER
// =====================================================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {

    console.log(
      'Connected to MongoDB'
    );

    app.listen(
      PORT,
      () => {

        console.log(
          `Registration server running on http://localhost:${PORT}`
        );

      }
    );

  })
  .catch((error) => {

    console.error(
      'MongoDB connection failed:',
      error
    );

    process.exit(1);

  });