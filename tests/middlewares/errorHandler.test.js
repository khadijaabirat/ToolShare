'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errorHandler = require('../../src/middlewares/errorHandler');

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('hides unexpected server errors from API responses', () => {
  const res = response();
  errorHandler(new Error('private hash or database details'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: 'Erreur serveur' });
});

test('preserves established client error messages', () => {
  const res = response();
  const error = new Error('Authentification requise.');
  error.statusCode = 401;
  errorHandler(error, {}, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Authentification requise.' });
});
