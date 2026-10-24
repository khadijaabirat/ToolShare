 const checkInstallationStatus = require("../services/instalationService");

async function getStatus(req,res,next){
    try{
        const status= await checkInstallationStatus();
        res.status(200).json({
        success:true,
        isInstalled :status
        });
    }
    catch(error){
next(error)
    }
}
module.exports=getStatus;