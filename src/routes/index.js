'use strict';

const express = require('express');
const router = express.Router();

const installationRoutes = require('./installationRoutes');
const magasinRoutes = require('./magasinRoutes');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const userRoutes = require('./userRoutes');
const reservationRoutes = require('./reservationRoutes');

router.use('/installation', installationRoutes);
router.use('/magasin', magasinRoutes);
router.use('/auth', authRoutes);
router.use('/users', profileRoutes);
router.use('/users', userRoutes);
router.use('/reservations',reservationRoutes);

module.exports = router;
