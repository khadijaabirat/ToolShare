'use strict';

const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const { getJwtSecret } = require('../utils/jwtConfig');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function authError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function authenticate(req, res, next) {
  const authorization = req.headers && req.headers.authorization;
  const match = typeof authorization === 'string'
    ? /^Bearer ([^\s]+)$/i.exec(authorization)
    : null;

  if (!match) return next(authError(401, 'Authentification requise.'));

  const secret = getJwtSecret();
  if (!secret) {
    return next(authError(503, 'Le service d’authentification est temporairement indisponible.'));
  }

  let claims;
  try {
    claims = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
  } catch (_error) {
    return next(authError(401, 'Authentification requise.'));
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !claims ||
    typeof claims !== 'object' ||
    Array.isArray(claims) ||
    typeof claims.sub !== 'string' ||
    !OBJECT_ID_PATTERN.test(claims.sub) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > now ||
    claims.exp <= claims.iat ||
    claims.exp <= now
  ) {
    return next(authError(401, 'Authentification requise.'));
  }

  return userRepository.findUserById(claims.sub)
    .then((user) => {
      if (!user || user.isActive !== true) {
        return next(authError(401, 'Authentification requise.'));
      }

      req.user = {
        id: String(user._id),
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        magasinId: user.magasinId ? String(user.magasinId) : null,
      };
      return next();
    })
    .catch(next);
}

module.exports = authenticate;
