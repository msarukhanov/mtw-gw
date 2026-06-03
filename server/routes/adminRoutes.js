const express = require('express');
const router = express.Router();

const path = require('path');
const adminController = require('../controllers/adminController');
const checkAdminAuth = require('../middlewares/auth'); // Подключаем защиту

// Защищаем ВСЕ роуты админки с помощью мидлвара
// router.use(checkAdminAuth);
//

// Роуты для админ-панели
// router.get('/admin', adminController.renderPanel);
router.get('/admin/data', adminController.getAdminData);
router.post('/admin/update-config', adminController.updateConfig);
router.post('/admin/update-jackpot', adminController.updateJackpot);
router.post('/admin/update-balance', adminController.updateBalance);

module.exports = router;