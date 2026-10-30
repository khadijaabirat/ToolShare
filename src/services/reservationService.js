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


async getreservationsWithFilter(user,filter){
   
    const query={...filter};
   if(user.role === 'Gestionnaire' ){
       if(!user.magasinId){
           const err = new Error('error');
           err.statusCode =403;
           throw err;
        }
        query.magasinId=user.magasinId;
    return await reservationRepository.getReservationWithFilter(query);
  }  
  if(user.role ==='Admin'){
    return await reservationRepository.getReservationWithFilter(filter);
  }
}

async enregistrerRetour(reservationId,user,etatRetour){
     if(!etatRetour){
        const err = new Error('etat obligatoire');
        err.statusCode=400;
        throw err;
    }
    const reservation= await reservationRepository.getReservation(reservationId);
    if(!reservation){
        const err = new Error('la reservation introuvable');
        err.statusCode=404;
        throw err;
    }
    if(user.role==='Gestionnaire'){
        if(user.magasinId?.toString()!==reservation.magasinId?.toString()){
             const err = new Error('impossible de modifier cette reservation ');
        err.statusCode=403;
        throw err;
        }
    }
      if (reservation.statut === 'TERMINEE' || reservation.statut === 'ANNULEE'){
   const err = new Error('impossible de modifier cette reservation ');
        err.statusCode=403;
        throw err;
        }
        const date= new Date();
        let status="DISPONIBLE";
        if(etatRetour =='ENDOMMAGE'){
            status="INDISPONIBLE"
        }
      
        return await reservationRepository.enregistrerRetour(reservationId, {
            dateReelleRetour: date,
            etatRetour,
            statut: status
        });
}
}
module.exports=new reservationService();