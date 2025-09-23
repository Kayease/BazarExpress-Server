const mongoose = require('mongoose')

const ChatbotQASchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatbotCategory', required: true },
}, { timestamps: true })

module.exports = mongoose.model('ChatbotQA', ChatbotQASchema)


