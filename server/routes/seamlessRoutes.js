const express = require('express');
const router = express.Router();

const showcaseController = require('../controllers/showcaseController');

router.post('/validate', showcaseController.validate);
router.post('/debit', showcaseController.debit);
router.post('/credit', showcaseController.credit);
router.get('/user-info', showcaseController.getUserInfo);
router.post('/login', showcaseController.login);

module.exports = router;