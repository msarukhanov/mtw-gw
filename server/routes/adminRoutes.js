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
router.post('/admin/end-tournament', adminController.endTournament);
router.post('/admin/add-promocode', adminController.addPromoCode);
router.post('/admin/run-cashback', adminController.runCashback);

// // Пример для роутов вашей админ-панели:
// router.get('/admin/mines/stats', (req, res) => {
//     res.json({
//         currentBank: state.getMinesBank(),
//         currentRtpSetting: state.getConfig().mines.rtpPercent
//     });
// });
//
// router.post('/admin/mines/set-rtp', (req, res) => {
//     const { newRtp } = req.body;
//     if (Number.isInteger(newRtp) && newRtp > 0 && newRtp <= 100) {
//         state.setMinesRtp(newRtp);
//         return res.json({ message: "RTP updated successfully" });
//     }
//     res.status(400).json({ error: "Invalid RTP value" });
// });

module.exports = router;