'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const UserRepository = require('../../src/repositories/userRepository');

const SECRET = 'profile-route-test-secret-at-least-thirty-two-bytes';
const USER_ID = '507f1f77bcf86cd799439011';

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function setJwtSecret(t) {
  const originalValue = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  t.after(() => {
    if (originalValue === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalValue;
  });
}

function replaceRepositoryMethod(t, method, implementation) {
  const original = UserRepository[method];
  UserRepository[method] = implementation;
  t.after(() => {
    UserRepository[method] = original;
  });
}

function makeToken() {
  return jwt.sign({ sub: USER_ID }, SECRET, { algorithm: 'HS256', expiresIn: '15m' });
}

function activeUser(overrides = {}) {
  return {
    _id: USER_ID,
    nom: 'Operator',
    prenom: 'Test',
    email: 'operator@example.com',
    role: 'Utilisateur',
    isActive: true,
    magasinId: null,
    password: 'never-return-this-hash',
    ...overrides,
  };
}

function mockAuthenticatedLookup(t, implementation = async () => activeUser()) {
  replaceRepositoryMethod(t, 'findUserById', implementation);
}

const PROFILE_PATHS = ['/api/users/me', '/api/auth/profile'];

async function send(method, body, token = makeToken(), path = '/api/users/me') {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('GET profile endpoints return the authenticated safe profile only', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);

  for (const path of PROFILE_PATHS) {
    const response = await send('GET', undefined, makeToken(), path);
    const body = await response.json();

    assert.equal(response.status, 200, path);
    assert.deepEqual(body, {
      user: {
        id: USER_ID,
        nom: 'Operator',
        prenom: 'Test',
        email: 'operator@example.com',
        role: 'Utilisateur',
        magasinId: null,
      },
    }, path);
    assert.equal(JSON.stringify(body).includes('never-return-this-hash'), false, path);
  }
});

test('GET and PUT profile reject unauthenticated requests', async (t) => {
  replaceRepositoryMethod(t, 'findUserById', () => assert.fail('lookup must not run'));

  for (const path of PROFILE_PATHS) {
    for (const [method, body] of [['GET'], ['PUT', { email: 'new@example.com' }]]) {
      const response = await send(method, body, null, path);
      const result = await response.json();
      assert.equal(response.status, 401, `${path} ${method}`);
      assert.deepEqual(result, { message: 'Authentification requise.' }, `${path} ${method}`);
    }
  }
});

test('deleted and inactive users cannot access profile routes', async (t) => {
  setJwtSecret(t);
  let user = null;
  mockAuthenticatedLookup(t, async () => user);

  for (const path of PROFILE_PATHS) {
    for (const currentUser of [null, activeUser({ isActive: false })]) {
      user = currentUser;
      const response = await send('GET', undefined, makeToken(), path);
      assert.equal(response.status, 401, path);
      assert.deepEqual(await response.json(), { message: 'Authentification requise.' }, path);
    }
  }
});

test('PUT profile normalizes and updates email', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);

  for (const path of PROFILE_PATHS) {
    let captured;
    replaceRepositoryMethod(t, 'updateProfile', async (id, updates) => {
      captured = { id, updates };
      return activeUser({ email: updates.email, password: 'must-not-return' });
    });

    const response = await send('PUT', { email: ' New.User@Example.COM ' }, makeToken(), path);
    const body = await response.json();

    assert.equal(response.status, 200, path);
    assert.deepEqual(captured, { id: USER_ID, updates: { email: 'new.user@example.com' } }, path);
    assert.deepEqual(body, {
      user: {
        id: USER_ID,
        nom: 'Operator',
        prenom: 'Test',
        email: 'new.user@example.com',
        role: 'Utilisateur',
        magasinId: null,
      },
    }, path);
    assert.equal(JSON.stringify(body).includes('must-not-return'), false, path);
  }
});

test('PUT rejects invalid bodies, email values, and protected or unknown fields', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);
  replaceRepositoryMethod(t, 'updateProfile', () => assert.fail('invalid input must not update'));
  replaceRepositoryMethod(t, 'updatePassword', () => assert.fail('invalid input must not update'));

  const invalidBodies = [
    { body: undefined, code: 'INVALID_REQUEST' },
    { body: null, code: 'INVALID_JSON' },
    ...[
      [],
      {},
      { email: 'not-an-email' },
      { role: 'ADMIN' },
      { email: 'new@example.com', isActive: false },
      { _id: '507f1f77bcf86cd799439012' },
      { id: '507f1f77bcf86cd799439012' },
      { password: 'new-password' },
      { currentPassword: 'current-password' },
      { newPassword: '' },
      { currentPassword: 'current-password', newPassword: 'new-password', extra: true },
    ].map((body) => ({ body, code: 'INVALID_REQUEST' })),
  ];

  for (const path of PROFILE_PATHS) {
    for (const input of invalidBodies) {
      const response = await send('PUT', input.body, makeToken(), path);
      assert.equal(response.status, 400, `${path} ${JSON.stringify(input.body)}`);
      const body = await response.json();
      assert.equal(body.message, input.code === 'INVALID_JSON'
        ? 'Corps JSON invalide.'
        : 'A valid profile update is required.', `${path} ${JSON.stringify(input.body)}`);
    }
  }
});

test('PUT reports duplicate email without returning repository details', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);
  replaceRepositoryMethod(t, 'updateProfile', async () => {
    throw Object.assign(new Error('private persistence detail'), { code: 'DUPLICATE_EMAIL' });
  });

  for (const path of PROFILE_PATHS) {
    const response = await send('PUT', { email: 'taken@example.com' }, makeToken(), path);
    const body = await response.json();
    assert.equal(response.status, 409, path);
    assert.deepEqual(body, { message: 'Email is already in use.' }, path);
    assert.equal(JSON.stringify(body).includes('private persistence detail'), false, path);
  }
});

test('PUT changes a password only after verifying the current password', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);

  for (const path of PROFILE_PATHS) {
    let comparedPassword;
    let storedPassword;
    replaceRepositoryMethod(t, 'findByIdForAuthentication', async () => ({
      ...activeUser(),
      async comparePassword(candidate) {
        comparedPassword = candidate;
        return candidate === 'current-password';
      },
    }));
    replaceRepositoryMethod(t, 'updatePassword', async (id, newPassword) => {
      storedPassword = { id, newPassword };
      return activeUser({ password: 'scrypt$not-returned' });
    });

    const response = await send('PUT', {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    }, makeToken(), path);
    const body = await response.json();

    assert.equal(response.status, 200, path);
    assert.equal(comparedPassword, 'current-password', path);
    assert.deepEqual(storedPassword, { id: USER_ID, newPassword: 'new-password' }, path);
    assert.deepEqual(body, {
      user: {
        id: USER_ID,
        nom: 'Operator',
        prenom: 'Test',
        email: 'operator@example.com',
        role: 'Utilisateur',
        magasinId: null,
      },
    }, path);
    assert.equal(JSON.stringify(body).includes('scrypt'), false, path);
    assert.equal(JSON.stringify(body).includes('current-password'), false, path);
    assert.equal(JSON.stringify(body).includes('new-password'), false, path);
  }
});

test('PUT rejects an incorrect current password without updating the password', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);
  replaceRepositoryMethod(t, 'findByIdForAuthentication', async () => ({
    ...activeUser(),
    async comparePassword() {
      return false;
    },
  }));
  replaceRepositoryMethod(t, 'updatePassword', () => assert.fail('password must not change'));

  for (const path of PROFILE_PATHS) {
    const response = await send('PUT', {
      currentPassword: 'wrong-password',
      newPassword: 'new-password',
    }, makeToken(), path);
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), { message: 'Current password is incorrect.' }, path);
  }
});

test('PUT reports a deleted or inactive account during password change as unauthenticated', async (t) => {
  setJwtSecret(t);
  mockAuthenticatedLookup(t);
  replaceRepositoryMethod(t, 'findByIdForAuthentication', async () => null);
  replaceRepositoryMethod(t, 'updatePassword', () => assert.fail('password must not change'));

  for (const path of PROFILE_PATHS) {
    const response = await send('PUT', {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    }, makeToken(), path);
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), { message: 'Authentication is required.' }, path);
  }
});
