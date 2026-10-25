'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../src/models/User');
const UserRepository = require('../../src/repositories/UserRepository');

function replaceMethod(t, target, method, replacement) {
  const original = target[method];
  target[method] = replacement;
  t.after(() => {
    target[method] = original;
  });
}

test('finds email case-insensitively and explicitly selects the password only for authentication', async (t) => {
  const calls = [];
  replaceMethod(t, User, 'findOne', (filter) => ({
    select(selection) {
      calls.push({ filter, selection });
      return Promise.resolve({ email: filter.email });
    },
  }));

  await UserRepository.findByEmail('  User@Example.COM ');
  await UserRepository.findByEmailForAuthentication('  User@Example.COM ');

  assert.deepEqual(calls, [
    { filter: { email: 'user@example.com' }, selection: '-password' },
    { filter: { email: 'user@example.com' }, selection: '+password' },
  ]);
});

test('explicitly selects the password for current-password verification by ID', async (t) => {
  let captured;
  replaceMethod(t, User, 'findById', (id) => ({
    select(selection) {
      captured = { id, selection };
      return Promise.resolve({ id });
    },
  }));

  await UserRepository.findByIdForAuthentication('user-id');
  assert.deepEqual(captured, { id: 'user-id', selection: '+password' });
});

test('returns null for an empty login identifier', async () => {
  assert.equal(await UserRepository.findByEmail('  '), null);
  assert.equal(await UserRepository.findByEmailForAuthentication(null), null);
});

test('profile updates allow only normalized email and validate the update', async (t) => {
  let captured;
  replaceMethod(t, User, 'findOne', () => ({ select: () => Promise.resolve(null) }));
  replaceMethod(t, User, 'findByIdAndUpdate', (id, update, options) => {
    captured = { id, update, options };
    return { select: (selection) => Promise.resolve({ id, selection }) };
  });

  const result = await UserRepository.updateProfile('user-id', {
    email: ' New.User@Example.com ',
    password: 'should-be-ignored',
    role: 'ADMIN',
    isActive: false,
    _id: 'different-id',
  });

  assert.deepEqual(captured, {
    id: 'user-id',
    update: { $set: { email: 'new.user@example.com' } },
    options: { new: true, runValidators: true },
  });
  assert.equal(result.selection, '-password');
});

test('rejects an email already assigned to another user', async (t) => {
  replaceMethod(t, User, 'findOne', () => ({ select: () => Promise.resolve({ _id: 'other-user' }) }));
  replaceMethod(t, User, 'findByIdAndUpdate', () => {
    assert.fail('must not update when the email is already used');
  });

  await assert.rejects(
    UserRepository.updateProfile('user-id', { email: 'other@example.com' }),
    (error) => error.code === 'DUPLICATE_EMAIL'
  );
});

test('maps duplicate-key races to a consistent repository error', async (t) => {
  replaceMethod(t, User, 'findOne', () => ({ select: () => Promise.resolve(null) }));
  replaceMethod(t, User, 'findByIdAndUpdate', () => ({
    select: () => Promise.reject(Object.assign(new Error('duplicate key'), {
      code: 11000,
      keyPattern: { email: 1 },
    })),
  }));

  await assert.rejects(
    UserRepository.updateProfile('user-id', { email: 'taken@example.com' }),
    (error) => error.code === 'DUPLICATE_EMAIL'
  );
});

test('does not issue an update when the profile contains no permitted fields', async (t) => {
  let updateCalled = false;
  replaceMethod(t, User, 'findByIdAndUpdate', () => {
    updateCalled = true;
  });
  replaceMethod(t, User, 'findById', (id) => ({
    select: (selection) => Promise.resolve({ id, selection }),
  }));

  const result = await UserRepository.updateProfile('user-id', {
    role: 'ADMIN',
    isActive: false,
    password: 'should-be-ignored',
  });

  assert.equal(updateCalled, false);
  assert.deepEqual(result, { id: 'user-id', selection: '-password' });
});

test('keeps password changes separate and returns a password-excluded user', async (t) => {
  let lookupCount = 0;
  let saved = false;
  const user = {
    _id: 'user-id',
    password: undefined,
    async save() {
      saved = true;
      this.password = 'stored-hash';
    },
  };

  replaceMethod(t, User, 'findById', () => {
    lookupCount += 1;
    if (lookupCount === 1) return Promise.resolve(user);
    return { select: (selection) => Promise.resolve({ selection, id: 'user-id' }) };
  });

  const result = await UserRepository.updatePassword('user-id', 'new-password');

  assert.equal(saved, true);
  assert.equal(user.password, 'stored-hash');
  assert.deepEqual(result, { selection: '-password', id: 'user-id' });
});
