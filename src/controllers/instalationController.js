 const instalationService = require("../services/instalationService");
 
async function getStatus(req,res,next){
    try{
        const status= await instalationService.checkInstallationStatus();
        res.status(200).json({
        success:true,
        isInstalled :status
        });
    }
    catch(error){
next(error)
    }
}

async function install(req,res,next) {
    try{
        const admin = await instalationService.instalationAplication(req.body);
       return res.status(201).json({
        success:true,
        message:'l application installer avec success',
        data:admin
       }) ;
    }catch(error){
        next(error);
    }

}
module.exports={getStatus,install};