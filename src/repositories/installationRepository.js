const AppConfig = require("../models/AppConfig");

 
    async function getInstallationStatus(){
          return await AppConfig.findOne();
    }
async function saveInstallation(adminId) {
    const installation = await AppConfig.create({
isInstalled:true,
installedAt:new Date(),
installedBy:adminId
    });
    return installation;
    
}
module.exports={getInstallationStatus,saveInstallation};
