'use strict';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function objectIdString(value) {
  if (typeof value === 'string') {
    return OBJECT_ID_PATTERN.test(value) ? value.toLowerCase() : null;
  }

  if (value && typeof value.toHexString === 'function') {
    try {
      const id = value.toHexString();
      return typeof id === 'string' && OBJECT_ID_PATTERN.test(id)
        ? id.toLowerCase()
        : null;
    } catch (_error) {
      return null;
    }
  }

  // Support a populated Magasin document while rejecting arbitrary objects.
  if (value && typeof value === 'object' && value._id !== value) {
    return objectIdString(value._id);
  }

  return null;
}

function scopeError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Authorize access to an existing material loaded by an earlier route handler.
 *
 * Contract: authentication must run first, then the route's material loader
 * must attach the database-loaded document to req.material. Never attach a
 * client-supplied object here or use req.body.magasinId as ownership evidence.
 */
function storeScopeMiddleware(req, res, next) {
  if (!req.user || !req.user.role) {
    return next(scopeError(401, 'Authentification requise.'));
  }

  const materialStoreId = objectIdString(req.material && req.material.magasinId);
  if (!materialStoreId) {
    return next(scopeError(403, 'Accès refusé. Le magasin du matériel est invalide.'));
  }

  if (req.user.role === 'Admin') return next();

  if (req.user.role !== 'Gestionnaire') {
    return next(scopeError(403, 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'));
  }

  const managerStoreId = objectIdString(req.user.magasinId);
  if (!managerStoreId) {
    return next(scopeError(403, 'Votre compte Gestionnaire n\'est pas associé à un magasin valide.'));
  }

  if (managerStoreId !== materialStoreId) {
    return next(scopeError(403, 'Accès refusé. Ce matériel appartient à un autre magasin.'));
  }

  return next();
}

module.exports = storeScopeMiddleware;
