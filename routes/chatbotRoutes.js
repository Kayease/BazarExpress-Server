const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/chatbotController')

router.get('/settings', ctrl.getSettings)
router.put('/settings', ctrl.updateSettings)

router.get('/qas', ctrl.listQAs)
router.post('/qas', ctrl.createQA)
router.delete('/qas/:id', ctrl.deleteQA)

// Categories
router.get('/categories', ctrl.listCategories)
router.post('/categories', ctrl.createCategory)
router.put('/categories/:id', ctrl.updateCategory)
router.delete('/categories/:id', ctrl.deleteCategory)

module.exports = router


