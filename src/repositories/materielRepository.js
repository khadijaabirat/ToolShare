const Materiel = require("../models/Materiel");

class materielRepository{

    async findMaterielById(id){
        return await Materiel.findById(id);
    }

    async UpdateMateriel(id,update){
        return await Materiel.findByIdAndUpdate(
                    id,
                    { statut: update },
                    { new: true, runValidators: true }
                );
    }
}
module.exports=new materielRepository();