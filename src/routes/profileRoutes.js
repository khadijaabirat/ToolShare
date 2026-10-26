'use strict';

const express = require('express');
const authenticate = require('../middlewares/authMiddleware');
const ProfileController = require('../controllers/profileController');

const router = express.Router();
router.get('/me', authenticate, ProfileController.getProfile);
router.put('/me', authenticate, ProfileController.updateProfile);

module.exports = router;
