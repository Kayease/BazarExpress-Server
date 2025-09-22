const mongoose = require('mongoose')

const ChatbotQASchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
}, { timestamps: true })

module.exports = mongoose.model('ChatbotQA', ChatbotQASchema)


