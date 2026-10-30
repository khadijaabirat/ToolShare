'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Materiel = require('../../src/models/Materiel');
const materielRepository = require('../../src/repositories/materielRepository');

function replaceMethod(t, target, method, replacement) {
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
}

test('maps a referenceKey duplicate-key race to a 409 conflict', async (t) => {
  replaceMethod(t, Materiel, 'create', () => Promise.reject(Object.assign(
    new Error('duplicate key'),
    { code: 11000, keyPattern: { referenceKey: 1 } }
  )));

  await assert.rejects(
    materielRepository.create({ reference: 'MAT-001', referenceKey: 'mat-001' }),
    (error) => error.statusCode === 409 && error.code === 'DUPLICATE_REFERENCE'
  );
});

test('does not mislabel an unrelated duplicate-key error as a reference conflict', async (t) => {
  const originalError = Object.assign(new Error('duplicate key'), {
    code: 11000,
    keyPattern: { unrelatedField: 1 },
  });
  replaceMethod(t, Materiel, 'create', () => Promise.reject(originalError));

  await assert.rejects(
    materielRepository.create({ reference: 'MAT-001', referenceKey: 'mat-001' }),
    (error) => error === originalError
  );
});

test('maps a duplicate reference index error during update to 409', async (t) => {
  replaceMethod(t, Materiel, 'findByIdAndUpdate', () => ({
    catch: (reject) => Promise.reject(Object.assign(new Error('duplicate key'), {
      code: 11000,
      keyPattern: { reference: 1 },
    })).catch(reject),
  }));

  await assert.rejects(
    materielRepository.updateFields('507f1f77bcf86cd799439011', { reference: 'MAT-001' }),
    (error) => error.statusCode === 409 && error.code === 'DUPLICATE_REFERENCE'
  );
});

test('activation updates only isActive and does not alter maintenance state', async (t) => {
  let captured;
  replaceMethod(t, Materiel, 'findByIdAndUpdate', (id, update, options) => {
    captured = { id, update, options };
    return Promise.resolve({ _id: id, isActive: false, statut: 'INDISPONIBLE' });
  });

  const result = await materielRepository.setActivation(
    '507f1f77bcf86cd799439011',
    false
  );

  assert.deepEqual(captured, {
    id: '507f1f77bcf86cd799439011',
    update: { $set: { isActive: false } },
    options: { new: true, runValidators: true },
  });
  assert.equal(result.statut, 'INDISPONIBLE');
});
