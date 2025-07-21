const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  message: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notice', noticeSchema); 