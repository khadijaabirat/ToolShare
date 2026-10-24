const instalationRepository=require('../repositories/installationRepository')
async function checkInstallationStatus(){

    const instalation= await instalationRepository.getInstallationStatus();
    if(instalation){
        return instalation.isInstalled;
    }else return false ;
}
module.exports=checkInstallationStatus;