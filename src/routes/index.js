const express = require('express');
const router = express.Router();
const instalationRoutes=require('./installationRoutes');

router.use('/installation',instalationRoutes);
module.exports = router;
