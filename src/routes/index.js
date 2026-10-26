const express = require('express');
const router = express.Router();
const instalationRoutes=require('./installationRoutes');
const magasinRoutes=require('./magasinRoutes');
const userRoutes=require('./userRoutes');

router.use('/installation',instalationRoutes);
router.use('/magasin',magasinRoutes);
router.use('/users',userRoutes);
module.exports = router;
