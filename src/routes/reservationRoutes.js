const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/', authMiddleware, reservationController.Create);
router.get('/my', authMiddleware, reservationController.getMyReservations);
router.get('/overdue', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), reservationController.getOverdueBorrowings);
router.delete('/:id', authMiddleware, reservationController.annulerReservation);
router.get('/', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), reservationController.getReservations);
router.post('/:id/handover', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), reservationController.enregistrerSortie);
router.post('/:id/return', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), reservationController.enregistrerRetour);

module.exports = router;
