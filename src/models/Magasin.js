const mongoose=require('mongoose');
 
const MagasinSchema= new mongoose.Schema({
    nom :{
        type:String,
        required:true,
        trim:true
    },
    adresse:{
        type:String,
        required:true,
        trim:true
    },
    isActive:{
        type:Boolean,
        default:true
    },
    site:{
        type:String,
        required:true,
        trim:true
    }
},{
    timestamps:true
});

module.exports=mongoose.model('Magasin',MagasinSchema);