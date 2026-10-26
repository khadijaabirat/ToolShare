const mongoose= require('mongoose');

const AppConfigSchema= new mongoose.Schema({
isInstalled:{
    type:Boolean,
    default:false
},
installedAt:{
    type:Date
},
installedBy:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'User'
}

});
module.exports=mongoose.model('AppConfig',AppConfigSchema);