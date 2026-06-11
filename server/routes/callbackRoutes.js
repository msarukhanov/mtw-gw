const express = require('express');
const router = express.Router();

const callbackController = require('../controllers/callbackController');

router.post('/callback/cryptomus', callbackController.cryptomusCallback);
router.post('/callback/aaio', callbackController.aaioCallback);
router.post('/callback/pix', callbackController.pixCallback);
router.post('/callback/payeer', callbackController.payeerCallback);
router.post('/callback/flutterwave', callbackController.flutterwaveCallback);
router.post('/callback/vodafone', callbackController.vodafoneCallback);

router.post('/callback/telegram', callbackController.vodafoneCallback);

module.exports = router;