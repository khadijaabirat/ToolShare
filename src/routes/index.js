const express = require('express');
const router = express.Router();
const instalationRoutes=require('./installationRoutes');
const magasinRoutes=require('./magasinRoutes');

router.use('/installation',instalationRoutes);
router.use('/magasin',magasinRoutes);
module.exports = router;
