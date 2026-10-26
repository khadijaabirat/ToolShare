'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../src/models/User');
const { hashPassword } = require('../../src/utils/password');

test('normalizes email and applies current domain defaults and roles', () => {
  const user = new User({
    nom: ' Operator ',
    prenom: ' Test ',
    email: '  TOOLSHARE.User@Example.COM  ',
    password: 'bcrypt-hash',
  });

  assert.equal(user.nom, 'Operator');
  assert.equal(user.prenom, 'Test');
  assert.equal(user.email, 'toolshare.user@example.com');
  assert.equal(user.isActive, true);
  assert.equal(user.role, 'Utilisateur');
  assert.deepEqual(User.schema.path('role').enumValues, ['Admin', 'Gestionnaire', 'Utilisateur']);
});

test('requires domain profile fields, email, and password', async () => {
  const error = await new User({}).validate().catch((validationError) => validationError);
  for (const field of ['nom', 'prenom', 'email', 'password']) assert.ok(error.errors[field]);
});

test('requires a magasinId for Gestionnaire users', async () => {
  const user = new User({
    nom: 'Manager', prenom: 'Test', email: 'manager@example.com',
    password: 'bcrypt-hash', role: 'Gestionnaire',
  });
  const error = await user.validate().catch((validationError) => validationError);
  assert.ok(error.errors.magasinId);
});

test('declares normalized unique email and hides password by default', () => {
  assert.equal(User.schema.path('email').options.unique, true);
  assert.equal(User.schema.path('email').options.lowercase, true);
  assert.equal(User.schema.path('email').options.trim, true);
  assert.equal(User.schema.path('password').options.select, false);
});

test('rejects malformed email addresses through model validation', async () => {
  const user = new User({
    nom: 'Operator', prenom: 'Test', email: 'not-an-email',
    password: 'bcrypt-hash', role: 'Utilisateur',
  });
  const error = await user.validate().catch((validationError) => validationError);
  assert.ok(error.errors.email);
});

test('bcrypt hashes are compatible with existing accounts and compare securely', async () => {
  const password = 'correct horse battery staple';
  const storedHash = await hashPassword(password);
  const user = new User({
    nom: 'Operator', prenom: 'Test', email: 'user@example.com',
    password: storedHash, role: 'Utilisateur',
  });

  assert.notEqual(storedHash, password);
  assert.match(storedHash, /^\$2[aby]\$10\$/);
  assert.equal(await user.comparePassword(password), true);
  assert.equal(await user.comparePassword('wrong password'), false);
});

test('password hashes are omitted from JSON serialization', async () => {
  const user = new User({
    nom: 'Operator', prenom: 'Test', email: 'user@example.com',
    password: 'sensitive-bcrypt-hash', role: 'Utilisateur',
  });

  assert.equal(Object.hasOwn(user.toJSON(), 'password'), false);
  assert.equal(JSON.stringify(user).includes('sensitive-bcrypt-hash'), false);
});
