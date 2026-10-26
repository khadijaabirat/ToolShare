'use strict';

/**
 * Authentication middleware integration point.
 *
 * This module is a stub that will be replaced when the authentication
 * feature (feature/auth-model-repository) is merged into dev.
 *
 * Expected contract from the Auth PR:
 *   - Reads Authorization: Bearer <token>
 *   - Verifies the JWT using JWT_SECRET from environment
 *   - Reloads the user from the database (to catch deactivated accounts)
 *   - Rejects inactive/deleted users with 401
 *   - Attaches req.user = { id, email, role } for downstream middleware
 *   - On missing/invalid token: responds 401 { message: ... }
 *   - On service failure: calls next(err)
 *
 * Until the Auth PR is merged, every protected route will respond with 503
 * to make it clear the dependency is missing — rather than silently bypassing
 * authentication, which would be a security vulnerability.
 */

const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function authMiddleware(req, res, next) {
  const authHeader = req.headers && req.headers.authorization;
  const match = typeof authHeader === 'string'
    ? /^Bearer ([^\s]+)$/i.exec(authHeader)
    : null;

  if (!match) {
    const err = new Error('Authentification requise.');
    err.statusCode = 401;
    return next(err);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const err = new Error('Le service d\'authentification est temporairement indisponible.');
    err.statusCode = 503;
    return next(err);
  }

  let claims;
  try {
    claims = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
  } catch (_e) {
    const err = new Error('Authentification requise.');
    err.statusCode = 401;
    return next(err);
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !claims ||
    typeof claims.sub !== 'string' ||
    !OBJECT_ID_PATTERN.test(claims.sub) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now
  ) {
    const err = new Error('Authentification requise.');
    err.statusCode = 401;
    return next(err);
  }

  // Reload the user from the database on every request so that a deactivated
  // account cannot keep using a previously-issued token.
  userRepository.findUserById(claims.sub)
    .then((user) => {
      if (!user || user.isActive !== true) {
        const err = new Error('Authentification requise.');
        err.statusCode = 401;
        return next(err);
      }
      req.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        magasinId: user.magasinId ? String(user.magasinId) : null,
      };
      return next();
    })
    .catch(next);
}

module.exports = authMiddleware;
