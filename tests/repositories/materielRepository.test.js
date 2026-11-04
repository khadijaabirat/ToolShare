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

test('findMaterielById aliases findById', async (t) => {
  const dummy = { _id: '507f1f77bcf86cd799439011', nom: 'Perceuse' };
  replaceMethod(t, Materiel, 'findById', (id) => Promise.resolve(id === dummy._id ? dummy : null));

  const direct = await materielRepository.findById('507f1f77bcf86cd799439011');
  const alias = await materielRepository.findMaterielById('507f1f77bcf86cd799439011');
  assert.equal(direct, dummy);
  assert.equal(alias, dummy);
});

test('updateFields accepts string status payload for reservation return compatibility', async (t) => {
  let captured;
  replaceMethod(t, Materiel, 'findByIdAndUpdate', (id, update, options) => {
    captured = { id, update, options };
    return {
      catch: (fn) => Promise.resolve({ _id: id, statut: update.$set.statut }),
    };
  });

  const res1 = await materielRepository.updateFields('507f1f77bcf86cd799439011', 'DISPONIBLE');
  assert.deepEqual(captured, {
    id: '507f1f77bcf86cd799439011',
    update: { $set: { statut: 'DISPONIBLE' } },
    options: { new: true, runValidators: true },
  });
  assert.equal(res1.statut, 'DISPONIBLE');

  const res2 = await materielRepository.UpdateMateriel('507f1f77bcf86cd799439011', 'INDISPONIBLE');
  assert.deepEqual(captured, {
    id: '507f1f77bcf86cd799439011',
    update: { $set: { statut: 'INDISPONIBLE' } },
    options: { new: true, runValidators: true },
  });
  assert.equal(res2.statut, 'INDISPONIBLE');
});

test('findByReferenceKey queries referenceKey and supports excludeId', async (t) => {
  let capturedFilter;
  let selected;
  replaceMethod(t, Materiel, 'findOne', (filter) => {
    capturedFilter = filter;
    return {
      select: (fields) => {
        selected = fields;
        return Promise.resolve({ _id: '507f1f77bcf86cd799439099' });
      },
    };
  });

  await materielRepository.findByReferenceKey('perceuse-01', '507f1f77bcf86cd799439011');
  assert.deepEqual(capturedFilter, {
    referenceKey: 'perceuse-01',
    _id: { $ne: '507f1f77bcf86cd799439011' },
  });
  assert.equal(selected, '_id');
});

test('findMany delegates to Materiel.find with filter', async (t) => {
  let capturedFilter;
  replaceMethod(t, Materiel, 'find', (filter) => {
    capturedFilter = filter;
    return Promise.resolve([{ _id: '507f1f77bcf86cd799439011' }]);
  });

  const res = await materielRepository.findMany({ isActive: true, magasinId: '507f1f77bcf86cd799439012' });
  assert.deepEqual(capturedFilter, { isActive: true, magasinId: '507f1f77bcf86cd799439012' });
  assert.equal(res.length, 1);
});
