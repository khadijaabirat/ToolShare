'use strict';

const express = require('express');
const AuthController = require('../controllers/authController');
const ProfileController = require('../controllers/profileController');
const authenticate = require('../middlewares/authMiddleware');

const router = express.Router();
router.post('/login', AuthController.login);
router.get('/profile', authenticate, ProfileController.getProfile);
router.put('/profile', authenticate, ProfileController.updateProfile);

module.exports = router;
