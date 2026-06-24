const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

// Получить текущее состояние магазина (или сгенерировать его, если наступил авто-рефреш)
router.post('/state', shopController.getShopState);

// Ручной сброс витрины за алмазы
router.post('/refresh-manual', shopController.refreshShopManual);

// Покупка за внутриигровую валюту (золото, алмазы и т.д.)
router.post('/buy-virtual', shopController.buyItemVirtual);

// Покупка-заглушка за реальные деньги ($)
router.post('/buy-cash-fake', shopController.buyItemCashFake);

module.exports = router;
