const express= require('express');
const router= express.Router();
const magasinControllor=require('../controllers/magasinController');

router.post('/',magasinControllor.create);
router.get('/',magasinControllor.getAll);
router.get('/active',magasinControllor.getActive);
router.get('/:id',magasinControllor.getById);
router.put('/:id',magasinControllor.update);
router.delete('/:id',magasinControllor.desactive);
router.patch('/:id/gestionnaire',magasinControllor.assignMagasin);

module.exports=router;