const mongoose = require('mongoose')

const ChatbotSettingSchema = new mongoose.Schema({
  botName: { type: String, default: 'BazarBot' },
  iconType: { type: String, enum: ['emoji', 'image'], default: 'emoji' },
  iconEmoji: { type: String, default: '🤖' },
  iconUrl: { type: String },
  primaryColor: { type: String, default: '#111827' },
  greetingMessage: { type: String, default: "Hi! I'm BazarBot. How can I assist you today?" },
  followUpMessage: { type: String, default: 'Do you need help regarding Orders, Refunds, or Other?' },
  fallbackMessage: { type: String, default: "Sorry, I didn't get that. You can ask about orders, refunds, or FAQs." },
}, { timestamps: true })

// We will keep a single document collection. Upsert on write.
module.exports = mongoose.model('ChatbotSetting', ChatbotSettingSchema)


