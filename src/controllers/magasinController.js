const magasinService = require("../services/magasinService");



async function create(req,res,next) {
    try{ const magasin = await magasinService.createMagasin(req.body);
    return res.status(201).json({
        success:true,
        message:'magasin create avec success',
        data:magasin
    });

    }catch (error) {
  next(error);
}
   
    
}
async function getAll(req,res,next) {
       try{const magasins= await magasinService.getAllMagasins();
      return res.status(200).json({
        success:true,
         data:magasins
    });

    }catch (error) {
  next(error);
}
    
    
}
async function  getById(req,res,next) {
       try{  const magasin = await magasinService.getmagasinById(req.params.id);
    return res.status(200).json({
        success:true,
        data:magasin
    });

    }catch (error) {
  next(error);
}
  
    
}

async function update(req,res,next) {
       try{ const magasin = await magasinService.updateMagasin(req.params.id,req.body);
       return res.status(200).json({
        success:true,
        message:'magasin modifier avec success',
        data:magasin
    });

    }catch (error) {
  next(error);
}
   
    
}

async function desactive(req,res,next) {
       try{ const magasin = await magasinService.desactiveMagasin(req.params.id);
     return res.status(200).json({
        success:true,
        message:'magasin desactivé avec success',
        data:magasin
    });

    }catch (error) {
  next(error);
}
   
}


async function assignMagasin(req,res,next) {
    try{
        const gestionnaire= await magasinService.assignGestionaireToMagasin(req.params.id,req.body.managerId);
  return res.status(200).json({
        success:true,
        message:'gestionnaire effectué avec success',
        data:gestionnaire
    });

    }
    catch(error){
next(error);
    }
    
}

async function getActive(req,res,next) {
    try{
        const magasins=await magasinService.getMagasinActive();
          return res.status(200).json({
        success:true,
        data:magasins
    });

    }catch(error){
next(error);
    }
}
module.exports={
    create,getAll,getById,update,desactive,assignMagasin,getActive
}