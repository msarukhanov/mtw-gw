const express = require('express');
const router = express.Router();

const inventoryController = require('../controllers/inventoryController');

router.post('/equip', inventoryController.equip);

module.exports = router;