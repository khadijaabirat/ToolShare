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
module.exports={
    Create
}