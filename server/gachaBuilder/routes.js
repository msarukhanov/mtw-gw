const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/authRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const itemsRoutes = require('./routes/itemsRoutes');
const shopRoutes = require('./routes/shopRoutes');
const gachaRoutes = require('./routes/gachaRoutes');
const gameRoutes = require('./routes/gameRoutes');
const heroRoutes = require('./routes/heroRoutes');
const battleRoutes = require('./routes/battleRoutes');

const auth = require('./routes/playerAuth');

router.use('/auth', authRoutes);
router.use('/inventory', auth, inventoryRoutes);
router.use('/items', auth, itemsRoutes);
router.use('/shop', auth, shopRoutes);
router.use('/gacha', auth, gachaRoutes);
router.use('/game', auth, gameRoutes);
router.use('/hero', auth, heroRoutes);
router.use('/battle', auth, battleRoutes);

module.exports = router;