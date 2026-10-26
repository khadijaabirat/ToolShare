'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../src/utils/password');

test('creates salted password hashes and verifies the correct password', async () => {
  const firstHash = await hashPassword('correct-password');
  const secondHash = await hashPassword('correct-password');

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword('correct-password', firstHash), true);
  assert.equal(await verifyPassword('incorrect-password', firstHash), false);
  assert.equal(await verifyPassword('correct-password', 'malformed-hash'), false);
});

test('rejects empty passwords when hashing', async () => {
  await assert.rejects(hashPassword(''), TypeError);
});
