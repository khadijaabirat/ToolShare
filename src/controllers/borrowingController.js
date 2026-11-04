'use strict';

const reservationService = require('../services/reservationService');

async function getOverdueBorrowings(req, res, next) {
    try {
        const user = req.user;
        const filter = req.query;
        const overdue = await reservationService.getOverdueBorrowings(user, filter);
        return res.status(200).json({
            success: true,
            count: overdue.length,
            data: overdue,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getOverdueBorrowings,
};
