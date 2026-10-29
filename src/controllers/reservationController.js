 const reservationService = require("../services/reservationService");

async function Create(req,res,next){
try{ 
    const data ={
        userId:req.user.id,
        magasinId:req.body.magasinId,
        materielId:req.body.materielId,
        dateDebut:req.body.dateDebut,
        dureeHeures:req.body.dureeHeures
    }
    if(!data.userId || !data.magasinId || !data.materielId || !data.dateDebut || !data.dureeHeures){
        return res.status(400).json({
            success:false,
            message:'les champs sont obligatoire'
        });
    }
const reservation = await reservationService.createReservation(data);
return res.status(201).json({
    success:true,
    message:'la reservation creé avec succes',
    data:reservation
});
}
catch(error){
    next(error);
}
}


async function getMyReservations(req,res,next){
    try{
        const reservations= await reservationService.getMyReservation(req.user.id);
        return res.status(200).json({
            success:true,
            data: reservations
        });
    }
    catch(error){
        next(error);
    }

}

async function annulerReservation(req,res,next){
    try{
        const userId=req.user.id;
        const id=req.params.id;
    const reservation= await reservationService.annulationReservation(id,userId);
return res.status(200).json({
    success:true,
    message:"la reservation annuler avec sucess",
    data:reservation
})
    }catch(error){
next(error);
    }

}

module.exports={
    Create, getMyReservations,annulerReservation
}