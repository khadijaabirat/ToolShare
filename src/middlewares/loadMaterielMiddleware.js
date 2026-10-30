'use strict';

const materielRepository = require('../repositories/materielRepository');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

async function loadMateriel(req, res, next) {
  const id = req.params.id;
  if (typeof id !== 'string' || !OBJECT_ID_PATTERN.test(id)) {
    const error = new Error('Identifiant matériel invalide.');
    error.statusCode = 400;
    return next(error);
  }

  try {
    const material = await materielRepository.findById(id);
    if (!material) {
      const error = new Error('Matériel introuvable.');
      error.statusCode = 404;
      return next(error);
    }

    req.material = material;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = loadMateriel;
