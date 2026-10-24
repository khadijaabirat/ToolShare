const express= require('express');
const getStatus = require('../controllers/instalationController');
const router=express.Router();

router.get('/status',getStatus);
module.exports=router;