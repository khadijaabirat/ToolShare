const express= require('express');
const router= express.Router();
const reservationController=require('../controllers/reservationController');
const authMiddleware=require('../middlewares/authMiddleware');

router.post('/',authMiddleware,reservationController.Create);
router.get('/my',authMiddleware,reservationController.getMyReservations);
module.exports= router; 