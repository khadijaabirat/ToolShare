'use strict';

/**
 * TOOL-87 — Reusable role-based authorization middleware.
 *
 * Usage:
 *   router.post('/users', authMiddleware, roleMiddleware('Admin', 'Gestionnaire'), ...)
 *
 * Requirements:
 *   - authMiddleware must run first and populate req.user.
 *   - Returns 401 when req.user is missing (auth not yet run or token invalid).
 *   - Returns 403 when the user's role is not in the allowed list.
 *   - Does NOT trust any role from the request body; reads only from req.user.
 */

const VALID_ROLES = new Set(['Admin', 'Gestionnaire', 'Utilisateur']);

function roleMiddleware(...allowedRoles) {
  // Validate at definition time so a typo in allowed roles fails loudly.
  for (const role of allowedRoles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`roleMiddleware: rôle inconnu "${role}". Valeurs valides: Admin, Gestionnaire, Utilisateur.`);
    }
  }

  const allowed = new Set(allowedRoles);

  return function checkRole(req, res, next) {
    // req.user is set by authMiddleware. If absent, authentication was not run.
    if (!req.user || !req.user.role) {
      const err = new Error('Authentification requise.');
      err.statusCode = 401;
      return next(err);
    }

    if (!allowed.has(req.user.role)) {
      const err = new Error('Accès refusé. Vous n\'avez pas les permissions nécessaires.');
      err.statusCode = 403;
      return next(err);
    }

    return next();
  };
}

module.exports = roleMiddleware;
