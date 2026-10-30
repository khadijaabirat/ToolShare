'use strict';

const express = require('express');
const installationRoutes = require('./installationRoutes');
const magasinRoutes = require('./magasinRoutes');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const userRoutes = require('./userRoutes');
const materielRoutes = require('./materielRoutes');

const router = express.Router();

router.use('/installation', installationRoutes);
router.use('/magasin', magasinRoutes);
router.use('/auth', authRoutes);
router.use('/users', profileRoutes);
router.use('/users', userRoutes);
router.use('/materials', materielRoutes);

module.exports = router;
