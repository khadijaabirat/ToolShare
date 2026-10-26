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
    dateDebut: debut,
    dureeHeures: Number(dureeHeures),
    dateFin: dateFin
}
}
}
module.exports=new reservationService();