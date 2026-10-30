const Reservation= require('../models/Reservation');
 const materielRepository = require('./materielRepository');
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


   async enregistrerRetour(id, { dateReelleRetour, date, etatRetour, statut, status }) {
    const dateToSave = dateReelleRetour || date || new Date();
    const statutToSave = statut || status || 'DISPONIBLE';
    const reservation = await Reservation.findByIdAndUpdate(
        id,
        { dateReelleDeReteur: dateToSave, etatRetour, statut: 'TERMINEE' },
        { new: true, runValidators: true }
    );
    if (reservation && reservation.materielId) {
        await materielRepository.UpdateMateriel(reservation.materielId, statutToSave);
    }
    return reservation;
   }



}
module.exports=new reservationRepository();