const express = require('express');
const router = express.Router();
const gachaController = require('../controllers/gachaController');

router.post('/summon', gachaController.summon);

module.exports = router;
