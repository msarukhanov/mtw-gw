const express = require('express');
const router = express.Router();

const itemsController = require('../controllers/itemsController');

router.post('/buy', itemsController.buyItem);

module.exports = router;