'use strict';

const bcrypt = require('bcryptjs');

const COST_FACTOR = 10;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }

  return bcrypt.hash(password, COST_FACTOR);
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') {
    return false;
  }

  try {
    return await bcrypt.compare(password, encodedHash);
  } catch (_error) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
