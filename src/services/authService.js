'use strict';

const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/userRepository');
const { isValidEmail, normalizeEmail } = require('../utils/email');
const { hashPassword, verifyPassword } = require('../utils/password');
const { getJwtSecret } = require('../utils/jwtConfig');

const DEFAULT_TOKEN_LIFETIME = '15m';
const TOKEN_ALGORITHM = 'HS256';
const DUMMY_HASH_PROMISE = hashPassword(randomBytes(32).toString('hex'));

class AuthError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function invalidCredentials() {
  return new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
}

async function login(credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw new AuthError(400, 'INVALID_REQUEST', 'A valid email and password are required.');
  }

  const email = normalizeEmail(credentials.email);
  const password = credentials.password;
  if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
    throw new AuthError(400, 'INVALID_REQUEST', 'A valid email and password are required.');
  }

  const secret = getJwtSecret();
  if (!secret) {
    throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  }

  const user = await UserRepository.findByEmailForAuthentication(email);
  const passwordMatches = user
    ? await user.comparePassword(password)
    : await verifyPassword(password, await DUMMY_HASH_PROMISE);

  if (!user || !passwordMatches || user.isActive !== true) {
    throw invalidCredentials();
  }

  const userId = String(user._id);
  const token = jwt.sign(
    { sub: userId },
    secret,
    {
      algorithm: TOKEN_ALGORITHM,
      expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_LIFETIME,
    }
  );

  return {
    token,
    user: {
      id: userId,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      magasinId: user.magasinId ? String(user.magasinId) : null,
    },
  };
}

module.exports = { AuthError, login };
