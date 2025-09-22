const ChatbotSetting = require('../models/ChatbotSetting')
const ChatbotQA = require('../models/ChatbotQA')
const ChatbotDoc = require('../models/ChatbotDoc')

exports.getSettings = async (req, res, next) => {
  try {
    const doc = await ChatbotSetting.findOne()
    if (!doc) {
      const created = await ChatbotSetting.create({})
      return res.json(created)
    }
    res.json(doc)
  } catch (e) { next(e) }
}

exports.updateSettings = async (req, res, next) => {
  try {
    const payload = req.body || {}
    const updated = await ChatbotSetting.findOneAndUpdate({}, payload, { new: true, upsert: true })
    res.json(updated)
  } catch (e) { next(e) }
}

exports.listQAs = async (req, res, next) => {
  try {
    const items = await ChatbotQA.find({}).sort({ createdAt: -1 })
    res.json(items)
  } catch (e) { next(e) }
}

exports.createQA = async (req, res, next) => {
  try {
    const { question, answer } = req.body || {}
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' })
    const item = await ChatbotQA.create({ question, answer })
    res.json(item)
  } catch (e) { next(e) }
}

exports.deleteQA = async (req, res, next) => {
  try {
    const { id } = req.params
    await ChatbotQA.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (e) { next(e) }
}

exports.listDocs = async (req, res, next) => {
  try {
    const items = await ChatbotDoc.find({}).sort({ createdAt: -1 })
    res.json(items)
  } catch (e) { next(e) }
}

exports.createDoc = async (req, res, next) => {
  try {
    const { filename, content, url } = req.body || {}
    if (!filename) return res.status(400).json({ error: 'filename is required' })
    const item = await ChatbotDoc.create({ filename, content: content || '', url })
    res.json(item)
  } catch (e) { next(e) }
}

exports.deleteDoc = async (req, res, next) => {
  try {
    const { id } = req.params
    await ChatbotDoc.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (e) { next(e) }
}


