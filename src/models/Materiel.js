const mongoose   = require("mongoose");

const MaterielSchema=new mongoose.Schema({
 reference:{
    type:String,
    required:true,
    unique:true,
    trim:true
 },
 referenceKey:{
    type:String,
    required:true,
    trim:true,
    lowercase:true
 },
 nom:{
    type:String,
    required:true,
    trim:true
 },
 categorie:{
    type:String,
    required:true,
    trim:true
 },
 description:{
    type:String,
    trim:true
 },
 statut:{
    type:String,
    enum: ['DISPONIBLE', 'INDISPONIBLE'],
    default:'DISPONIBLE'
 },
 magasinId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'Magasin',
    required:true
 },
 isActive:{
    type:Boolean,
    default:true
 }

},{
    timestamps:true,
    autoIndex:false
});

// Declared for the explicit rollout migration; automatic index creation is disabled.
MaterielSchema.index({ referenceKey: 1 }, { unique: true });

module.exports=mongoose.model('Materiel',MaterielSchema);
