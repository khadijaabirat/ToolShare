'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const UserRepository = require('../../src/repositories/UserRepository');

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

function setEnvironment(t, name, value) {
  const originalValue = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;

  t.after(() => {
    if (originalValue === undefined) delete process.env[name];
    else process.env[name] = originalValue;
  });
}

function mockLoginLookup(t, implementation) {
  const original = UserRepository.findByEmailForAuthentication;
  UserRepository.findByEmailForAuthentication = implementation;
  t.after(() => {
    UserRepository.findByEmailForAuthentication = original;
  });
}

async function postJson(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function activeUser() {
  return {
    _id: 'user-123',
    email: 'operator@example.com',
    role: 'WAREHOUSE_OPERATOR',
    isActive: true,
    password: 'never-serialize-this-hash',
    async comparePassword(password) {
      return password === 'correct-password';
    },
  };
}

test('POST /api/auth/login returns a short-lived token and safe user data', async (t) => {
  const secret = 'unit-test-secret-with-at-least-thirty-two-bytes';
  setEnvironment(t, 'JWT_SECRET', secret);
  let lookedUpEmail;
  mockLoginLookup(t, async (email) => {
    lookedUpEmail = email;
    return activeUser();
  });

  const response = await postJson({
    email: '  OPERATOR@Example.COM ',
    password: 'correct-password',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(lookedUpEmail, 'operator@example.com');
  assert.deepEqual(Object.keys(body).sort(), ['token', 'user']);
  assert.deepEqual(body.user, {
    id: 'user-123',
    email: 'operator@example.com',
    role: 'WAREHOUSE_OPERATOR',
  });
  assert.equal(JSON.stringify(body).includes('never-serialize-this-hash'), false);
  assert.equal(Object.hasOwn(body.user, 'password'), false);

  const claims = jwt.verify(body.token, secret, { algorithms: ['HS256'] });
  assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'sub']);
  assert.equal(claims.sub, 'user-123');
  assert.equal(claims.exp - claims.iat, 15 * 60);
  assert.equal(jwt.decode(body.token, { complete: true }).header.alg, 'HS256');
  assert.throws(
    () => jwt.verify(body.token, secret, {
      algorithms: ['HS256'],
      clockTimestamp: claims.exp + 1,
    }),
    { name: 'TokenExpiredError' }
  );
});

test('invalid credentials use the same response for unknown email and wrong password', async (t) => {
  setEnvironment(t, 'JWT_SECRET', 'unit-test-secret-with-at-least-thirty-two-bytes');
  mockLoginLookup(t, async (email) => (email === 'unknown@example.com' ? null : activeUser()));

  const unknownResponse = await postJson({ email: 'unknown@example.com', password: 'wrong-password' });
  const unknownBody = await unknownResponse.json();
  const wrongPasswordResponse = await postJson({ email: 'operator@example.com', password: 'wrong-password' });
  const wrongPasswordBody = await wrongPasswordResponse.json();

  assert.equal(unknownResponse.status, 401);
  assert.equal(wrongPasswordResponse.status, 401);
  assert.deepEqual(unknownBody, wrongPasswordBody);
  assert.deepEqual(unknownBody, {
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
  });
});

test('inactive accounts are rejected without a token', async (t) => {
  setEnvironment(t, 'JWT_SECRET', 'unit-test-secret-with-at-least-thirty-two-bytes');
  mockLoginLookup(t, async () => ({ ...activeUser(), isActive: false }));

  const response = await postJson({ email: 'operator@example.com', password: 'correct-password' });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  assert.equal(Object.hasOwn(body, 'token'), false);
});

test('malformed credentials and malformed JSON receive JSON client errors', async (t) => {
  setEnvironment(t, 'JWT_SECRET', 'unit-test-secret-with-at-least-thirty-two-bytes');
  mockLoginLookup(t, async () => {
    assert.fail('invalid input must be rejected before looking up a user');
  });

  const invalidBody = await postJson({ email: 'not-an-email', password: 'password' });
  assert.equal(invalidBody.status, 400);
  assert.equal((await invalidBody.json()).error.code, 'INVALID_REQUEST');

  const missingPassword = await postJson({ email: 'operator@example.com' });
  assert.equal(missingPassword.status, 400);
  assert.equal((await missingPassword.json()).error.code, 'INVALID_REQUEST');

  const invalidJson = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, 'INVALID_JSON');
});

test('missing or known-placeholder JWT configuration fails without looking up a user', async (t) => {
  let lookupCalled = false;
  const originalSecret = process.env.JWT_SECRET;
  mockLoginLookup(t, async () => {
    lookupCalled = true;
    return activeUser();
  });
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  for (const secret of [undefined, 'replace_with_a_local_development_secret']) {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    const response = await postJson({ email: 'operator@example.com', password: 'correct-password' });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(body, {
      error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' },
    });
  }

  assert.equal(lookupCalled, false);
});
