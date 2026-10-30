'use strict';

const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const loadMateriel = require('../middlewares/loadMaterielMiddleware');
const storeScopeMiddleware = require('../middlewares/storeScopeMiddleware');
const materielController = require('../controllers/materielController');

const router = express.Router();
const materialManagers = [authMiddleware, roleMiddleware('Admin', 'Gestionnaire')];
const scopedMaterial = [...materialManagers, loadMateriel, storeScopeMiddleware];

router.post('/', ...materialManagers, materielController.createMaterial);
router.get('/', ...materialManagers, materielController.listMaterials);
router.patch('/:id/activation', ...scopedMaterial, materielController.setActivation);
router.get('/:id', ...scopedMaterial, materielController.getMaterial);
router.put('/:id', ...scopedMaterial, materielController.updateMaterial);
router.delete('/:id', ...scopedMaterial, materielController.deactivateMaterial);

module.exports = router;
