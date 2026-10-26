const express = require('express');
const router = express.Router();
const instalationRoutes=require('./installationRoutes');
const magasinRoutes=require('./magasinRoutes');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');

router.use('/installation',instalationRoutes);
router.use('/magasin',magasinRoutes);
router.use('/auth', authRoutes);
router.use('/users', profileRoutes);
module.exports = router;
