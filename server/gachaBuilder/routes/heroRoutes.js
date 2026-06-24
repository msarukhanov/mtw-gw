const express = require('express');
const router = express.Router();
const heroesController = require('../controllers/heroesController');

// Экипировка, автоэквип, прокачка уровней и эволюция звезд
router.post('/equip', heroesController.equipItem);
router.post('/auto-equip', heroesController.autoEquip);
router.post('/levelup', heroesController.levelUp);
router.post('/upgrade-stars', heroesController.upgradeStars);
router.post('/manage-pets', heroesController.managePet);
router.post('/team/save', heroesController.saveTeam);

module.exports = router;
