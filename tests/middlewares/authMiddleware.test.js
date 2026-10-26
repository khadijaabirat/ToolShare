'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authenticate = require('../../src/middlewares/authMiddleware');
const UserRepository = require('../../src/repositories/userRepository');

const SECRET = 'middleware-test-secret-with-at-least-thirty-two-bytes';
const USER_ID = '507f1f77bcf86cd799439011';

function setEnvironment(t, name, value) {
  const originalValue = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;

  t.after(() => {
    if (originalValue === undefined) delete process.env[name];
    else process.env[name] = originalValue;
  });
}

function mockFindById(t, implementation) {
  const original = UserRepository.findUserById;
  UserRepository.findUserById = implementation;
  t.after(() => {
    UserRepository.findUserById = original;
  });
}

function makeToken(claims = { sub: USER_ID }, secret = SECRET, options = {}) {
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: '15m', ...options });
}

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(token) {
  const req = { headers: {} };
  if (token !== undefined) req.headers.authorization = token;
  const res = makeResponse();
  let nextError;
  let nextCalled = false;
  const next = (error) => {
    nextCalled = true;
    nextError = error;
    if (error) res.status(error.statusCode).json({ message: error.message });
  };

  await authenticate(req, res, next);
  return { req, res, nextCalled, nextError };
}

function activeUser() {
  return {
    _id: USER_ID,
    nom: 'Operator',
    prenom: 'Test',
    email: 'operator@example.com',
    role: 'Utilisateur',
    isActive: true,
    magasinId: null,
    password: 'never-return-this-hash',
  };
}

test('accepts a valid HS256 token and attaches only safe fields for an active user', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, async (id) => {
    assert.equal(id, USER_ID);
    return activeUser();
  });

  const result = await invoke(`Bearer ${makeToken()}`);
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.deepEqual(result.req.user, {
    id: USER_ID,
    nom: 'Operator',
    prenom: 'Test',
    email: 'operator@example.com',
    role: 'Utilisateur',
    magasinId: null,
  });
  assert.equal(Object.hasOwn(result.req.user, 'password'), false);
  assert.equal(JSON.stringify(result.req.user).includes('never-return-this-hash'), false);
});

test('rejects a missing Authorization header', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  const { res, req } = await invoke();
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Authentification requise.' });
  assert.equal(req.user, undefined);
});

test('rejects malformed Bearer headers', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  for (const header of ['Basic abc', 'Bearer', 'Bearer a b', 'Bearer  abc']) {
    const req = { headers: { authorization: header } };
    const res = makeResponse();
    await authenticate(req, res, (error) => {
      assert.ok(error, header);
      res.status(error.statusCode).json({ message: error.message });
    });
    assert.equal(res.statusCode, 401, header);
  }
});

test('rejects an invalid signature', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  const result = await invoke(`Bearer ${makeToken({ sub: USER_ID }, 'different-signing-secret-32-bytes')}`);
  assert.equal(result.res.statusCode, 401);
});

test('rejects an expired token', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ sub: USER_ID, iat: now - 120, exp: now - 60 }, SECRET, { algorithm: 'HS256' });

  const result = await invoke(`Bearer ${token}`);
  assert.equal(result.res.statusCode, 401);
});

test('rejects tokens signed with an unsupported algorithm', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  const token = jwt.sign({ sub: USER_ID }, SECRET, { algorithm: 'HS384', expiresIn: '15m' });
  const result = await invoke(`Bearer ${token}`);
  assert.equal(result.res.statusCode, 401);
});

test('rejects missing and invalid subject claims', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  for (const claims of [{}, { sub: 'not-an-object-id' }, { sub: 123 }]) {
    const result = await invoke(`Bearer ${makeToken(claims)}`);
    assert.equal(result.res.statusCode, 401);
  }
});

test('rejects tokens without the expected issued-at and expiration claims', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  mockFindById(t, () => assert.fail('lookup must not run'));

  const token = jwt.sign({ sub: USER_ID }, SECRET, { algorithm: 'HS256' });
  const result = await invoke(`Bearer ${token}`);
  assert.equal(result.res.statusCode, 401);
});

test('rejects deleted and inactive users', async (t) => {
  setEnvironment(t, 'JWT_SECRET', SECRET);
  let currentUser = null;
  mockFindById(t, async () => currentUser);
  const token = `Bearer ${makeToken()}`;

  const deleted = await invoke(token);
  assert.equal(deleted.res.statusCode, 401);

  currentUser = { ...activeUser(), isActive: false };
  const inactive = await invoke(token);
  assert.equal(inactive.res.statusCode, 401);
  assert.equal(inactive.req.user, undefined);
});

test('fails safely when JWT_SECRET is missing or invalid', async (t) => {
  mockFindById(t, () => assert.fail('lookup must not run'));

  for (const secret of [undefined, 'short', 'replace_with_a_local_development_secret']) {
    setEnvironment(t, 'JWT_SECRET', secret);
    const result = await invoke(`Bearer ${makeToken()}`);
    assert.equal(result.res.statusCode, 503);
    assert.deepEqual(result.res.body, {
      message: 'Le service d’authentification est temporairement indisponible.',
    });
    assert.equal(JSON.stringify(result.res.body).includes(SECRET), false);
  }
});
