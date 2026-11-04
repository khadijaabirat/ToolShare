'use strict';

const express = require('express');
const router = express.Router();
const borrowingController = require('../controllers/borrowingController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.get('/overdue', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), borrowingController.getOverdueBorrowings);

module.exports = router;
