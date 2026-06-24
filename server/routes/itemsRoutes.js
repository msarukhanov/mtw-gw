const express = require('express');
const router = express.Router();
const itemsController = require('../controllers/itemsController');

router.post('/buy', itemsController.buyItem);
router.post('/sell', itemsController.sellItem);
router.post('/open-chest', itemsController.openChest);

router.post('/craft', itemsController.craftItem);
router.post('/autocraft', itemsController.autoCraftItem);

module.exports = router;
