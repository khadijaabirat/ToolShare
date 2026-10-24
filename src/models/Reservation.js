const mongoose = require("mongoose");
  
const ReservationSchema=new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    materielId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Materiel',
        required:true
    },
    magasinId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Magasin',
        required:true
    },
    dateDebut:{
        type:Date,
        required:true
    },
    dureeHeures:{
        type:Number,
        required:true,
        min:1
    },
    dateFin:{
        type:Date,
        required:true,
 
    },
    dateReelleSortie:{
        type:Date

    },
    dateReelleDeReteur:{
        type:Date
    },
    etatRetour:{
        type:String,
        enum:['BON_ETAT', 'ENDOMMAGE']
    },
    statut:{
        type:String,
        enum:['CONFIRMEE', 'EN_COURS', 'TERMINEE', 'ANNULEE'],
        default:'CONFIRMEE'
    }
},{
    timestamps:true
})

module.exports=mongoose.model('Reservation',ReservationSchema);