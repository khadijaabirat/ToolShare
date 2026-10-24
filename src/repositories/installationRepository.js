const AppConfig = require("../models/AppConfig");

 
    async function getInstallationStatus(){
          return await AppConfig.findOne();
    }

module.exports={getInstallationStatus};
