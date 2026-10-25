
const Magasin = require('../models/Magasin');

class magasinRepository{
    async createmagasin(data){
      return await Magasin.create({
            nom:data.nom,
            adresse:data.adresse,
            site:data.site
        });
        
    }

    async findAllMagasins(){
        return await Magasin.find();
    }

    async findMagasinById(id){
        return await Magasin.findById(id);
    }

    async updateMagasin(id,data){
        return await Magasin.findByIdAndUpdate(id,data,{
            new:true,
            runValidators:true
        });
    }

    async deactiveMagasin(id){
        return await Magasin.findByIdAndUpdate(id,{isActive:false},{
            new:true,
            runValidators:true
        });
    }
}
module.exports=new magasinRepository();