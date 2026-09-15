const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deploying';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'changeme';

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Database setup ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS attendees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    organization TEXT,
    checkedIn INTEGER NOT NULL DEFAULT 0,
    checkedInAt TEXT,
    checkedOutAt TEXT,
    addedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Safe migration for databases created before checkedInAt/checkedOutAt existed
try { db.exec('ALTER TABLE attendees ADD COLUMN checkedInAt TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE attendees ADD COLUMN checkedOutAt TEXT'); } catch (e) { /* already exists */ }



function getMeta() {
  const rows = db.prepare('SELECT key, value FROM meta').all();
  const meta = { name: 'Year 2 Learning Event', date: '', capacity: 140 };
  for (const row of rows) {
    if (row.key === 'capacity') meta.capacity = parseInt(row.value, 10) || 140;
    else meta[row.key] = row.value;
  }
  return meta;
}

function setMetaValue(key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

function uid() {
  return 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function computeStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM attendees').get().c;
  const checkedIn = db.prepare('SELECT COUNT(*) AS c FROM attendees WHERE checkedIn = 1').get().c;
  return {
    totalAttendees: total,
    checkedInCount: checkedIn,
    notCheckedInCount: total - checkedIn
  };
}

// ---------- Auth ----------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized staff access' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized staff access' });
  }
}

app.post('/api/staff/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== STAFF_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = jwt.sign({ role: 'staff' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// ---------- Meta ----------
app.get('/api/staff/meta', requireAuth, (req, res) => {
  res.json(getMeta());
});

app.put('/api/staff/meta', requireAuth, (req, res) => {
  const { name, date, capacity } = req.body || {};
  if (name !== undefined) setMetaValue('name', name);
  if (date !== undefined) setMetaValue('date', date);
  if (capacity !== undefined) {
    const cap = parseInt(capacity, 10);
    setMetaValue('capacity', isNaN(cap) || cap <= 0 ? 140 : cap);
  }
  res.json(getMeta());
});

// ---------- Attendees ----------
app.get('/api/staff/attendees', requireAuth, (req, res) => {
  const { search = '', checkedIn } = req.query;
  let rows = db.prepare('SELECT * FROM attendees ORDER BY name COLLATE NOCASE').all();

  if (checkedIn === 'true') rows = rows.filter(r => r.checkedIn);
  if (checkedIn === 'false') rows = rows.filter(r => !r.checkedIn);

  const q = String(search).trim().toLowerCase();
  if (q) {
    rows = rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.organization || '').toLowerCase().includes(q)
    );
  }

  res.json({
    items: rows.map(r => ({ ...r, checkedIn: !!r.checkedIn })),
    total: rows.length,
    stats: computeStats()
  });
});

app.post('/api/staff/attendees', requireAuth, (req, res) => {
  const { name, phone, email, organization } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone number are required.' });
  }

  const meta = getMeta();
  const total = db.prepare('SELECT COUNT(*) AS c FROM attendees').get().c;
  if (total >= meta.capacity) {
    return res.status(409).json({ error: `Capacity reached (${meta.capacity}/${meta.capacity}).` });
  }

  const normPhone = normalizePhone(phone);
  const dup = db.prepare('SELECT id, phone FROM attendees').all()
    .some(a => normalizePhone(a.phone) === normPhone && normPhone !== '');
  if (dup) {
    return res.status(409).json({ error: 'Someone with this phone number is already on the list.' });
  }

  const attendee = {
    id: uid(), name, phone, email: email || '', organization: organization || '',
    checkedIn: 0, addedAt: new Date().toISOString()
  };
  db.prepare(
    'INSERT INTO attendees (id, name, phone, email, organization, checkedIn, addedAt) VALUES (@id, @name, @phone, @email, @organization, @checkedIn, @addedAt)'
  ).run(attendee);

  res.status(201).json({ ...attendee, checkedIn: false });
});

app.patch('/api/staff/attendees/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Attendee not found.' });

  const { name, phone, email, organization, checkedIn } = req.body || {};
  const wasCheckedIn = !!existing.checkedIn;
  const nextCheckedIn = checkedIn !== undefined ? !!checkedIn : wasCheckedIn;

  const now = new Date().toISOString();
  let checkedInAt = existing.checkedInAt;
  let checkedOutAt = existing.checkedOutAt;
  if (checkedIn !== undefined && nextCheckedIn !== wasCheckedIn) {
    if (nextCheckedIn) { checkedInAt = now; checkedOutAt = null; }
    else { checkedOutAt = now; }
  }

  const updated = {
    id: existing.id,
    name: name !== undefined ? name : existing.name,
    phone: phone !== undefined ? phone : existing.phone,
    email: email !== undefined ? email : existing.email,
    organization: organization !== undefined ? organization : existing.organization,
    checkedIn: nextCheckedIn ? 1 : 0,
    checkedInAt, checkedOutAt
  };
  db.prepare(
    'UPDATE attendees SET name=@name, phone=@phone, email=@email, organization=@organization, checkedIn=@checkedIn, checkedInAt=@checkedInAt, checkedOutAt=@checkedOutAt WHERE id=@id'
  ).run(updated);

  res.json({ ...updated, checkedIn: !!updated.checkedIn });
});

app.delete('/api/staff/attendees/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM attendees WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Attendee not found.' });
  res.json({ ok: true });
});

app.post('/api/staff/attendees/bulk-delete', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const del = db.prepare('DELETE FROM attendees WHERE id = ?');
  const runBulk = db.transaction((items) => { for (const id of items) del.run(id); });
  runBulk(ids);
  res.json({ deleted: ids.length });
});

// Bulk import: body = { rows: [{name, phone, email, organization}, ...] }
app.post('/api/staff/attendees/import', requireAuth, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const meta = getMeta();

  const existingPhones = new Set(
    db.prepare('SELECT phone FROM attendees').all().map(r => normalizePhone(r.phone)).filter(Boolean)
  );
  let total = db.prepare('SELECT COUNT(*) AS c FROM attendees').get().c;

  let added = 0, duplicates = 0, overCapacity = 0, invalid = 0;
  const insert = db.prepare(
    'INSERT INTO attendees (id, name, phone, email, organization, checkedIn, addedAt) VALUES (@id, @name, @phone, @email, @organization, 0, @addedAt)'
  );

  const runImport = db.transaction((items) => {
    for (const row of items) {
      const name = (row.name || '').trim();
      const phone = (row.phone || '').trim();
      if (!name || !phone) { invalid++; continue; }
      const normPhone = normalizePhone(phone);
      if (normPhone && existingPhones.has(normPhone)) { duplicates++; continue; }
      if (total >= meta.capacity) { overCapacity++; continue; }
      insert.run({
        id: uid(), name, phone,
        email: (row.email || '').trim(),
        organization: (row.organization || '').trim(),
        addedAt: new Date().toISOString()
      });
      if (normPhone) existingPhones.add(normPhone);
      total++;
      added++;
    }
  });
  runImport(rows);

  res.json({ added, duplicates, overCapacity, invalid });
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Registration server running on http://localhost:${PORT}`);
  if (STAFF_PASSWORD === 'changeme') {
    console.log('WARNING: using default STAFF_PASSWORD — set the STAFF_PASSWORD env var before deploying.');
  }
});
