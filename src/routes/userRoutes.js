'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const userController = require('../controllers/userController');

// TOOL-88: Create user account (Admin or Gestionnaire only).
router.post(
    '/',
    authMiddleware,
    roleMiddleware('Admin', 'Gestionnaire'),
    userController.createUser
);

// TOOL-89: List users (Admin sees all; Gestionnaire sees their magasin only).
router.get(
    '/',
    authMiddleware,
    roleMiddleware('Admin', 'Gestionnaire'),
    userController.listUsers
);

// TOOL-89: Deactivate a user account (Admin only).
router.patch(
    '/:id/deactivate',
    authMiddleware,
    roleMiddleware('Admin'),
    userController.deactivateUser
);

module.exports = router;
