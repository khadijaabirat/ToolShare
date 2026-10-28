const Reservation= require('../models/Reservation');

class reservationRepository{
    async findOverlappingReservation(materielId, ndateDebut, ndateFin) {
        return await Reservation.findOne({
            materielId: materielId,
            statut: { $in: ['CONFIRMEE', 'EN_COURS'] },
            dateDebut: { $lt: ndateFin },
            dateFin: { $gt: ndateDebut }
        });
    }


    async createReservation(data){
        return await Reservation.create(data);
    }


    async getMyReservations(userId){
        return await Reservation.find({userId:userId})
        .populate('materielId','nom description')
        .populate('magasinId','nom adresse site')
    }

}
module.exports=new reservationRepository();