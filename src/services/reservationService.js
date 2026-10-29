const reservationRepository = require("../repositories/reservationRepository");

class reservationService{
async calculeDatesReservation(dateDebut,dureeHeures){
    if(!dureeHeures || dureeHeures<=0 || isNaN(dureeHeures)){
        const err = new Error('la duré obligatoire et doit etre superieur a 0 ');
        err.statusCode=400;
        throw err;
    }
    const debut= new Date(dateDebut);
    if( isNaN(debut.getTime()) || debut< new Date() ){
          const err = new Error('la date debut obligatoire et ne peut pas etre dans le passé ');
        err.statusCode=400;
        throw err;
    }
const dateFin =new Date(debut.getTime()+(dureeHeures*60*60*1000));
return {
    dateDebut:debut,
    dureeHeures:Number(dureeHeures),
    dateFin:dateFin
}
}




async checkAvailability(materielId, ndateDebut, ndateFin){
const  reservation = await reservationRepository.findOverlappingReservation(materielId, ndateDebut, ndateFin);
if(reservation){
        const err = new Error('ce matériel est déjà réservé');
        err.statusCode=409;
        throw err;
}
return true;
}


async createReservation({userId,magasinId,materielId,dateDebut,dureeHeures}){
    const dates = await this.calculeDatesReservation(dateDebut,dureeHeures);
    if(await this.checkAvailability(materielId,dates.dateDebut,dates.dateFin)){
        return await reservationRepository.createReservation({userId,magasinId,materielId, ...dates});
    }
}

async getMyReservation(userId){
return await reservationRepository.getMyReservations(userId);
}


async annulationReservation(id,userId){
    const reservation = await reservationRepository.getReservation(id);

    if(!reservation ){
const err = new Error('la reservation et introuvable ou sa date on passé');
err.statusCode=404;
throw err;
    }
        if( reservation.dateDebut< new Date() || reservation.userId.toString()!==userId.toString() || reservation.statut!="CONFIRMEE"){
const err = new Error(' la date de reservation dans passé ou la annulation pas possible ');
err.statusCode=400;
throw err;
    }
    return await reservationRepository.annulerReservation(id);
}

}
module.exports=new reservationService();