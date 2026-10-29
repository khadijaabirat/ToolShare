const express= require('express');
const router= express.Router();
const reservationController=require('../controllers/reservationController');
const authMiddleware=require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/',authMiddleware,reservationController.Create);
router.get('/my',authMiddleware,reservationController.getMyReservations);
router.delete('/:id',authMiddleware,reservationController.annulerReservation);
router.get('/',authMiddleware,roleMiddleware('Admin','Gestionnaire'),reservationController.getReservations);
module.exports= router; 