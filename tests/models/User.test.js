'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const { scrypt: scryptCallback } = require('node:crypto');
const User = require('../../src/models/User');
const { hashPassword, verifyPassword } = require('../../src/utils/password');

const scrypt = promisify(scryptCallback);

function runSaveHooks(document) {
  return new Promise((resolve, reject) => {
    User.schema.s.hooks.execPre('save', document, [], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test('normalizes email and defaults new users to active', () => {
  const user = new User({
    email: '  TOOLSHARE.User@Example.COM  ',
    password: 'example-password',
    role: 'unconfirmed-role',
  });

  assert.equal(user.email, 'toolshare.user@example.com');
  assert.equal(user.isActive, true);
  assert.equal(user.role, 'unconfirmed-role');
});

test('requires email, password, and role without inventing role values', async () => {
  const user = new User({});
  const error = await user.validate().catch((validationError) => validationError);

  assert.ok(error.errors.email);
  assert.ok(error.errors.password);
  assert.ok(error.errors.role);
  assert.deepEqual(User.schema.path('role').enumValues, []);
});

test('declares email uniqueness and normalizes it before validation', () => {
  assert.equal(User.schema.path('email').options.unique, true);
  assert.equal(User.schema.path('email').options.lowercase, true);
  assert.equal(User.schema.path('email').options.trim, true);
});

test('hashes modified passwords once and verifies them safely', async () => {
  const user = new User({
    email: 'user@example.com',
    password: 'correct horse battery staple',
    role: 'operator',
  });

  await runSaveHooks(user);
  const storedHash = user.password;

  assert.notEqual(storedHash, 'correct horse battery staple');
  assert.match(storedHash, /^scrypt\$16384\$8\$5\$/);
  assert.equal(await user.comparePassword('correct horse battery staple'), true);
  assert.equal(await user.comparePassword('wrong password'), false);

  // A completed save clears modified paths before another save begins.
  user.$__reset();
  user.role = 'another-role';
  await runSaveHooks(user);
  assert.equal(user.password, storedHash);
});

test('uses salted hashes and rejects malformed or mismatched hashes', async () => {
  const firstHash = await hashPassword('same-password');
  const secondHash = await hashPassword('same-password');

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword('same-password', firstHash), true);
  assert.equal(await verifyPassword('other-password', firstHash), false);
  assert.equal(await verifyPassword('same-password', 'invalid'), false);
});

test('continues to verify existing scrypt hashes created with the previous work factor', async () => {
  const password = 'legacy-password';
  const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const key = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const oldHash = `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;

  assert.equal(await verifyPassword(password, oldHash), true);
});

test('excludes password from ordinary queries and serialization', () => {
  const user = new User({
    email: 'user@example.com',
    password: 'scrypt$16384$8$1$0123456789abcdef0123456789abcdef$0123456789abcdef'.padEnd(145, '0'),
    role: 'operator',
  });

  assert.equal(User.schema.path('password').options.select, false);
  assert.equal(Object.hasOwn(user.toObject(), 'password'), false);
  assert.equal(Object.hasOwn(user.toJSON(), 'password'), false);
});
