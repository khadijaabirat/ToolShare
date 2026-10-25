const magasinRepository=require('../repositories/magasinRepository');
const userRepository = require('../repositories/userRepository');


class magasinService{


async createMagasin(data){
if(!data.nom || !data.site || !data.adresse){
    const err=new Error('le nom , site et adresse sont obligatoire');
    err.statusCode=400;
    throw err;
}
return await magasinRepository.createmagasin(data);
}

async getAllMagasins(){
    return await magasinRepository.findAllMagasins();
}

async getmagasinById(id){
    const magasin = await magasinRepository.findMagasinById(id);
    if(!magasin){
const err= new Error('magasin son introuvable');
err.statusCode=400;
throw err;
    }
    return magasin;
}


async updateMagasin(id,data){
    const magasin = await magasinRepository.findMagasinById(id);
    if(!magasin){
        const err = new Error('magasin sont introuvable');
        err.statusCode=400;
        throw err;
    }
    return await magasinRepository.updateMagasin(id,data);
}

async desactiveMagasin(id){

        const magasin = await magasinRepository.findMagasinById(id);
    if(!magasin){
        const err = new Error('magasin sont introuvable');
        err.statusCode=400;
        throw err;
    }
    return magasinRepository.deactiveMagasin(id);
}


async assignGestionaireToMagasin(magasinId,gestionnaireId){
    const magasin = await magasinRepository.findMagasinById(magasinId);
    if(!magasin){
        const err=new Error('magasin nexist pas');
        err.statusCode=404;
        throw err;
    }
    if(!magasin.isActive){
        const err=new Error('magasin desactivé');
        err.statusCode=400;
        throw err;
    }
    const gestionnaire= await userRepository.findUserById(gestionnaireId);
    if(!gestionnaire){
        const err=new Error('gestionnaire nexist pas');
        err.statusCode=404;
        throw err;
    }
    if(gestionnaire.role!=='Gestionnaire'){
        const err=new Error('utilisateur doit avoir le rôle Gestionnaire pour être affecté à un magasin');
        err.statusCode=400;
        throw err;
    }
    if(!gestionnaire.isActive){
        const err=new Error('ce gestionnaire est disactivé');
        err.statusCode=400;
        throw err;
    }
    return userRepository.assignMagasin(gestionnaireId,magasinId);
}
}
module.exports=new magasinService();