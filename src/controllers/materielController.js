'use strict';

const materielService = require('../services/materielService');

async function createMaterial(req, res, next) {
  try {
    const material = await materielService.createMaterial(req.user, req.body);
    return res.status(201).json({
      success: true,
      message: 'Matériel créé avec succès.',
      data: material,
    });
  } catch (error) {
    return next(error);
  }
}

async function listMaterials(req, res, next) {
  try {
    const materials = await materielService.listMaterials(req.user, req.query);
    return res.status(200).json({ success: true, data: materials });
  } catch (error) {
    return next(error);
  }
}

function getMaterial(req, res) {
  return res.status(200).json({ success: true, data: req.material });
}

async function updateMaterial(req, res, next) {
  try {
    const material = await materielService.updateMaterial(req.material, req.body);
    return res.status(200).json({
      success: true,
      message: 'Matériel modifié avec succès.',
      data: material,
    });
  } catch (error) {
    return next(error);
  }
}

async function setActivation(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((field) => field !== 'isActive') ||
        !Object.prototype.hasOwnProperty.call(body, 'isActive')) {
      const error = new Error('Seul le champ isActive est autorisé.');
      error.statusCode = 400;
      throw error;
    }

    const material = await materielService.setActivation(req.material, body.isActive);
    return res.status(200).json({
      success: true,
      message: body.isActive ? 'Matériel activé avec succès.' : 'Matériel désactivé avec succès.',
      data: material,
    });
  } catch (error) {
    return next(error);
  }
}

async function deactivateMaterial(req, res, next) {
  try {
    const material = await materielService.setActivation(req.material, false);
    return res.status(200).json({
      success: true,
      message: 'Matériel désactivé avec succès.',
      data: material,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createMaterial,
  listMaterials,
  getMaterial,
  updateMaterial,
  setActivation,
  deactivateMaterial,
};
