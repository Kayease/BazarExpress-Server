const mongoose = require('mongoose')

const ChatbotDocSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  content: { type: String, default: '' },
  url: { type: String },
}, { timestamps: true })

module.exports = mongoose.model('ChatbotDoc', ChatbotDocSchema)


