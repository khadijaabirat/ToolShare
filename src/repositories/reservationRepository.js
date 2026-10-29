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

    async annulerReservation(id){
        return await Reservation.findByIdAndUpdate(id , {statut:"ANNULEE"},
            {
            new:true,
            runValidators:true
        }
    );
   }
   async getReservation(id){
return await Reservation.findById(id);
   }

   async getReservationWithFilter(filter){
    const Reservations=await Reservation.find(filter)
    .populate('materielId','nom reference')
    .populate('userId','nom prenom email');
    return Reservations;
   }
}
module.exports=new reservationRepository();