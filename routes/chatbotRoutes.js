const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/chatbotController')

router.get('/settings', ctrl.getSettings)
router.put('/settings', ctrl.updateSettings)

router.get('/qas', ctrl.listQAs)
router.post('/qas', ctrl.createQA)
router.delete('/qas/:id', ctrl.deleteQA)

router.get('/docs', ctrl.listDocs)
router.post('/docs', ctrl.createDoc)
router.delete('/docs/:id', ctrl.deleteDoc)

module.exports = router


