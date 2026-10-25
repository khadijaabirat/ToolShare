'use strict';

const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/UserRepository');
const { getJwtSecret } = require('../utils/jwtConfig');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function unauthorized(res) {
  return res.status(401).json({
    error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  });
}

function authenticate(req, res, next) {
  const authorization = req.get ? req.get('authorization') : req.headers?.authorization;
  const match = typeof authorization === 'string'
    ? /^Bearer ([^\s]+)$/i.exec(authorization)
    : null;

  if (!match) return unauthorized(res);

  const secret = getJwtSecret();
  if (!secret) {
    return res.status(503).json({
      error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' },
    });
  }

  let claims;
  try {
    claims = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
  } catch (_error) {
    return unauthorized(res);
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
    return unauthorized(res);
  }

  return UserRepository.findById(claims.sub)
    .then((user) => {
      if (!user || user.isActive !== true) return unauthorized(res);

      req.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
      };
      return next();
    })
    .catch(next);
}

module.exports = authenticate;
