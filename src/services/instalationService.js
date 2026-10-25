const bcrypt=require('bcryptjs');
const instalationRepository=require('../repositories/installationRepository');
const userRepository = require('../repositories/userRepository');
 

class installationServices{

    async checkInstallationStatus(){
        
        const instalation= await instalationRepository.getInstallationStatus();
        if(instalation){
        return instalation.isInstalled;
    }else return false ;
}





async instalationAplication(adminData){
const instalation = await this.checkInstallationStatus();
if(instalation){
    const err=new Error('l application déja installer');
    err.statusCode=400;
    throw err;
    
}

const user = await userRepository.findByEmail(adminData.email);
if(user){
    const err= new Error('ce email est exist déja');
    err.statusCode=409;
    throw err;
}
const passwordhash=await bcrypt.hash(adminData.password,10);

const newAdmin= await userRepository.createUser({
    nom:adminData.nom,
    prenom:adminData.prenom,
    email:adminData.email,
    password:passwordhash,
    role:'Admin',
});
const instalationtrue=await instalationRepository.saveInstallation(newAdmin._id);
return newAdmin;
}

}
module.exports=new installationServices();