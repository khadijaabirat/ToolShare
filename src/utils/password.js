'use strict';

const { promisify } = require('node:util');
const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');

const scrypt = promisify(scryptCallback);
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 5;
const SUPPORTED_PARALLELIZATION_VALUES = new Set([1, PARALLELIZATION]);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('hex'),
    derivedKey.toString('hex'),
  ].join('$');
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, saltHex, keyHex, ...extra] = encodedHash.split('$');
  const storedParallelization = Number(parallelization);
  if (
    algorithm !== 'scrypt' ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    !SUPPORTED_PARALLELIZATION_VALUES.has(storedParallelization) ||
    extra.length !== 0 ||
    !/^[a-f\d]{32}$/i.test(saltHex || '') ||
    !/^[a-f\d]{128}$/i.test(keyHex || '')
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');
  const actualKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: storedParallelization,
    maxmem: MAX_MEMORY,
  });

  return timingSafeEqual(expectedKey, actualKey);
}

module.exports = { hashPassword, verifyPassword };
