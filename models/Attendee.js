const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      default: '',
      trim: true
    },

    organization: {
      type: String,
      default: '',
      trim: true
    },

    gender: {
      type: String,
      default: '',
      trim: true
    },

    disabilityType: {
      type: String,
      default: '',
      trim: true
    },

    ageRange: {
      type: String,
      default: '',
      trim: true
    },

    state: {
      type: String,
      default: '',
      trim: true
    },
    lga: {
      type: String,
      default: ''
    },

    designation: {
      type: String,
      default: ''
    },
    address: {
      type: String,
      default: '',
      trim: true
    },

    bankName: {
      type: String,
      default: '',
      trim: true
    },

    bankCode: {
      type: String,
      default: '',
      trim: true
    },

    accountNumber: {
      type: String,
      default: '',
      trim: true
    },

    accountName: {
      type: String,
      default: '',
      trim: true
    },

    signatureData: {
      type: String,
      default: null
    },

    checkedIn: {
      type: Boolean,
      default: false
    },

    checkedInAt: {
      type: Date,
      default: null
    },

    checkedOutAt: {
      type: Date,
      default: null
    },

    addedAt: {
      type: Date,
      default: Date.now
    }
  },

  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.Attendee ||
  mongoose.model('Attendee', attendeeSchema);