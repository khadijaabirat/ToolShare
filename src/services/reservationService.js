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
}
module.exports=new reservationService();