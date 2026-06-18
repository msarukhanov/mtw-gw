const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/authRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const itemsRoutes = require('./routes/itemsRoutes');
const gachaRoutes = require('./routes/gachaRoutes');

router.use('/auth', authRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/items', itemsRoutes);
router.use('/gacha', gachaRoutes);

module.exports = router;