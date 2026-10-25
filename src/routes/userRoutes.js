'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const UserController = require('../controllers/userController');

const router = express.Router();
router.get('/me', authenticate, UserController.getProfile);
router.put('/me', authenticate, UserController.updateProfile);

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
});

module.exports = router;
