'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const storeScopeMiddleware = require('../../src/middlewares/storeScopeMiddleware');

const STORE_A = '507f1f77bcf86cd799439011';
const STORE_B = '507f1f77bcf86cd799439012';

function run(req) {
  return new Promise((resolve) => {
    storeScopeMiddleware(req, {}, (error) => resolve(error));
  });
}

function manager(storeId = STORE_A) {
  return { id: '507f1f77bcf86cd799439013', role: 'Gestionnaire', magasinId: storeId };
}

describe('storeScopeMiddleware', () => {
  test('returns 401 when authentication has not populated req.user', async () => {
    const error = await run({ material: { magasinId: STORE_A } });
    assert.equal(error.statusCode, 401);
  });

  test('allows Admin access to a material with valid store ownership', async () => {
    assert.equal(await run({ user: { role: 'Admin' }, material: { magasinId: STORE_B } }), undefined);
  });

  test('allows a Gestionnaire to access material in their assigned store', async () => {
    assert.equal(await run({ user: manager(), material: { magasinId: STORE_A } }), undefined);
  });

  test('accepts ObjectId ownership from the loaded Mongoose material', async () => {
    assert.equal(await run({
      user: manager(),
      material: { magasinId: new mongoose.Types.ObjectId(STORE_A) },
    }), undefined);
  });

  test('accepts a populated Magasin reference from the loaded material', async () => {
    assert.equal(await run({
      user: manager(),
      material: { magasinId: { _id: new mongoose.Types.ObjectId(STORE_A) } },
    }), undefined);
  });

  test('denies a Gestionnaire access to a material in another store', async () => {
    const error = await run({ user: manager(), material: { magasinId: STORE_B } });
    assert.equal(error.statusCode, 403);
  });

  test('denies Utilisateur access to material management', async () => {
    const error = await run({
      user: { role: 'Utilisateur', magasinId: STORE_A },
      material: { magasinId: STORE_A },
    });
    assert.equal(error.statusCode, 403);
  });

  test('denies a Gestionnaire without a valid assigned store', async () => {
    for (const magasinId of [null, undefined, 'not-an-object-id']) {
      const error = await run({
        user: { id: '507f1f77bcf86cd799439013', role: 'Gestionnaire', magasinId },
        material: { magasinId: STORE_A },
      });
      assert.equal(error.statusCode, 403);
    }
  });

  test('fails closed for absent material or missing/malformed material ownership', async () => {
    for (const material of [
      undefined,
      {},
      { magasinId: null },
      { magasinId: 'bad-id' },
      { magasinId: { toHexString: () => { throw new Error('malformed id'); } } },
    ]) {
      const error = await run({ user: { role: 'Admin' }, material });
      assert.equal(error.statusCode, 403);
    }
  });

  test('does not use a client-supplied magasinId to authorize a missing material', async () => {
    const error = await run({
      user: manager(),
      body: { magasinId: STORE_A },
    });
    assert.equal(error.statusCode, 403);
  });
});
