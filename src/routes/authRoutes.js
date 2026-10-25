'use strict';

const express = require('express');
const AuthController = require('../controllers/authController');
const UserController = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.post('/login', AuthController.login);
router.get('/profile', authenticate, UserController.getProfile);
router.put('/profile', authenticate, UserController.updateProfile);

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
});

module.exports = router;
