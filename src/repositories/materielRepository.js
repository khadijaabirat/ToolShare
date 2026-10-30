'use strict';

class materielRepository {
    async findById(id) {
        return await Materiel.findById(id);
    }

    async findMaterielById(id) {
        return await this.findById(id);
    }

    async updateFields(id, update) {
        const payload = typeof update === 'string' ? { statut: update } : update;
        return await Materiel.findByIdAndUpdate(
            id,
            payload,
            { new: true, runValidators: true }
        );
    }

    async UpdateMateriel(id, update) {
        return await this.updateFields(id, update);
    }
}

module.exports = new materielRepository();
const Materiel = require('../models/Materiel');

function duplicateReferenceError(error) {
  const keyPattern = error && error.keyPattern;
  const keyValue = error && error.keyValue;
  const duplicateIndex = error && typeof error.message === 'string' &&
    /(?:reference|referenceKey)_1/.test(error.message);
  const duplicateField = (fields) => fields &&
    (Object.prototype.hasOwnProperty.call(fields, 'reference') ||
      Object.prototype.hasOwnProperty.call(fields, 'referenceKey'));

  if (!error || error.code !== 11000 ||
      (!duplicateField(keyPattern) && !duplicateField(keyValue) && !duplicateIndex)) {
    return null;
  }

  const conflict = new Error('Une référence matériel identique existe déjà.');
  conflict.statusCode = 409;
  conflict.code = 'DUPLICATE_REFERENCE';
  return conflict;
}

class MaterielRepository {
  create(data) {
    return Materiel.create(data).catch((error) => {
      throw duplicateReferenceError(error) || error;
    });
  }

  findMany(filter) {
    return Materiel.find(filter);
  }

  findById(id) {
    return Materiel.findById(id);
  }

  findByReferenceKey(referenceKey, excludeId) {
    const filter = { referenceKey };
    if (excludeId) filter._id = { $ne: excludeId };
    return Materiel.findOne(filter).select('_id');
  }

  updateFields(id, updates) {
    return Materiel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).catch((error) => {
      throw duplicateReferenceError(error) || error;
    });
  }

  setActivation(id, isActive) {
    return Materiel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true, runValidators: true }
    );
  }
}

module.exports = new MaterielRepository();
