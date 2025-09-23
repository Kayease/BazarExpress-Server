const ChatbotSetting = require('../models/ChatbotSetting')
const ChatbotQA = require('../models/ChatbotQA')
const ChatbotCategory = require('../models/ChatbotCategory')

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
    const { question, answer, categoryId } = req.body || {}
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' })
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required' })
    const item = await ChatbotQA.create({ question, answer, categoryId })
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

// FAQ Documents endpoints removed

// ===== Categories =====
exports.listCategories = async (req, res, next) => {
  try {
    const items = await ChatbotCategory.find({}).sort({ name: 1 })
    res.json(items)
  } catch (e) { next(e) }
}

exports.createCategory = async (req, res, next) => {
  try {
    const { name } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })
    const item = await ChatbotCategory.create({ name: name.trim() })
    res.json(item)
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ error: 'Category already exists' })
    next(e)
  }
}

exports.updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })
    const updated = await ChatbotCategory.findByIdAndUpdate(id, { name: name.trim() }, { new: true })
    res.json(updated)
  } catch (e) { next(e) }
}

exports.deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params
    await ChatbotCategory.findByIdAndDelete(id)
    // Optionally unset categoryId from QAs referencing this category
    await ChatbotQA.updateMany({ categoryId: id }, { $unset: { categoryId: 1 } })
    res.json({ success: true })
  } catch (e) { next(e) }
}


