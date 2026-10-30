'use strict';

const mongoose = require('mongoose');
const materielRepository = require('../repositories/materielRepository');
const magasinRepository = require('../repositories/magasinRepository');
const { normalizeReference } = require('../utils/materialReferenceAudit');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CREATE_FIELDS = new Set(['reference', 'nom', 'categorie', 'description', 'magasinId']);
const UPDATE_FIELDS = new Set(['reference', 'nom', 'categorie', 'description']);

function serviceError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertObject(data, message) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw serviceError(400, message);
  }
}

function rejectUnsupportedFields(data, allowedFields) {
  const unsupported = Object.keys(data).filter((field) => !allowedFields.has(field));
  if (unsupported.length) {
    throw serviceError(400, `Champ(s) non autorisé(s): ${unsupported.join(', ')}.`);
  }
}

function normalizeRequiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw serviceError(400, `Le champ ${field} est obligatoire et doit être une chaîne non vide.`);
  }
  return value.trim();
}

function normalizeDescription(value) {
  if (typeof value !== 'string') {
    throw serviceError(400, 'Le champ description doit être une chaîne de caractères.');
  }
  return value.trim();
}

function assertPermittedCaller(caller) {
  if (!caller || !['Admin', 'Gestionnaire'].includes(caller.role)) {
    throw serviceError(403, 'Accès refusé. Vous n\'avez pas les permissions nécessaires.');
  }
}

function assertValidStoreId(storeId, statusCode, message) {
  if (typeof storeId !== 'string' || !OBJECT_ID_PATTERN.test(storeId) ||
      !mongoose.isValidObjectId(storeId)) {
    throw serviceError(statusCode, message);
  }
}

async function assertStoreExists(storeId, statusCode, message) {
  const store = await magasinRepository.findMagasinById(storeId);
  if (!store) throw serviceError(statusCode, message);
}

async function assertReferenceAvailable(referenceKey, excludeId) {
  const existing = await materielRepository.findByReferenceKey(referenceKey, excludeId);
  if (existing) throw serviceError(409, 'Une référence matériel identique existe déjà.');
}

class MaterielService {
  async createMaterial(caller, data) {
    assertPermittedCaller(caller);
    assertObject(data, 'Les informations du matériel sont invalides.');
    rejectUnsupportedFields(data, CREATE_FIELDS);
    if (caller.role === 'Gestionnaire' &&
        Object.prototype.hasOwnProperty.call(data, 'magasinId')) {
      throw serviceError(400, 'Le champ magasinId ne peut pas être fourni par un Gestionnaire.');
    }

    const reference = normalizeRequiredString(data.reference, 'reference');
    const referenceKey = normalizeReference(reference);
    const nom = normalizeRequiredString(data.nom, 'nom');
    const categorie = normalizeRequiredString(data.categorie, 'categorie');
    const description = data.description === undefined
      ? undefined
      : normalizeDescription(data.description);

    let magasinId;
    if (caller.role === 'Gestionnaire') {
      assertValidStoreId(
        caller.magasinId,
        403,
        'Votre compte Gestionnaire n\'est pas associé à un magasin valide.'
      );
      magasinId = caller.magasinId;
      await assertStoreExists(magasinId, 403, 'Votre magasin est introuvable.');
    } else {
      assertValidStoreId(data.magasinId, 400, 'magasinId invalide.');
      magasinId = data.magasinId;
      await assertStoreExists(magasinId, 400, 'Le magasin fourni est introuvable.');
    }

    await assertReferenceAvailable(referenceKey);

    return materielRepository.create({
      reference,
      referenceKey,
      nom,
      categorie,
      ...(description !== undefined ? { description } : {}),
      magasinId,
      isActive: true,
    });
  }

  async listMaterials(caller, query) {
    assertPermittedCaller(caller);
    assertObject(query || {}, 'Les paramètres de recherche sont invalides.');
    rejectUnsupportedFields(query || {}, new Set(['isActive']));

    let isActive = true;
    if (query && Object.prototype.hasOwnProperty.call(query, 'isActive')) {
      if (query.isActive === 'false') isActive = false;
      else if (query.isActive !== 'true') {
        throw serviceError(400, 'Le paramètre isActive doit valoir true ou false.');
      }
    }

    const filter = { isActive };
    if (caller.role === 'Gestionnaire') {
      assertValidStoreId(
        caller.magasinId,
        403,
        'Votre compte Gestionnaire n\'est pas associé à un magasin valide.'
      );
      filter.magasinId = caller.magasinId;
    }
    return materielRepository.findMany(filter);
  }

  async updateMaterial(material, data) {
    assertObject(data, 'Les informations de mise à jour sont invalides.');
    rejectUnsupportedFields(data, UPDATE_FIELDS);
    const fields = Object.keys(data);
    if (fields.length === 0) throw serviceError(400, 'Aucun champ modifiable fourni.');

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(data, 'reference')) {
      updates.reference = normalizeRequiredString(data.reference, 'reference');
      updates.referenceKey = normalizeReference(updates.reference);
      await assertReferenceAvailable(updates.referenceKey, material._id);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'nom')) {
      updates.nom = normalizeRequiredString(data.nom, 'nom');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'categorie')) {
      updates.categorie = normalizeRequiredString(data.categorie, 'categorie');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
      updates.description = normalizeDescription(data.description);
    }

    return materielRepository.updateFields(material._id, updates);
  }

  async setActivation(material, isActive) {
    if (typeof isActive !== 'boolean') {
      throw serviceError(400, 'Le champ isActive doit être un booléen.');
    }
    return materielRepository.setActivation(material._id, isActive);
  }
}

module.exports = new MaterielService();
