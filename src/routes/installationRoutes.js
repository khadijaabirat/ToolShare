const express= require('express');
const installationController = require('../controllers/instalationController');
 const router=express.Router();

router.get('/status',installationController.getStatus);
router.post('/',installationController.install);
module.exports=router;