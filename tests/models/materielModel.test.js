'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Materiel = require('../../src/models/Materiel');

test('declares trimmed display references and normalized unique reference keys without auto-indexing', () => {
  const material = new Materiel({
    reference: ' MAT-001 ',
    referenceKey: 'mat-001',
    nom: ' Perceuse ',
    categorie: ' Outil ',
    magasinId: '507f1f77bcf86cd799439011',
  });

  assert.equal(material.reference, 'MAT-001');
  assert.equal(material.referenceKey, 'mat-001');
  assert.equal(Materiel.schema.options.autoIndex, false);
  assert.equal(Materiel.schema.path('reference').options.unique, true);
  assert.equal(Materiel.schema.path('referenceKey').options.required, true);
  assert.ok(Materiel.schema.indexes().some(([fields, options]) =>
    fields.referenceKey === 1 && options.unique === true
  ));
});

test('requires material reference, normalized key, name, category, and store', async () => {
  const error = await new Materiel({}).validate().catch((validationError) => validationError);
  for (const field of ['reference', 'referenceKey', 'nom', 'categorie', 'magasinId']) {
    assert.ok(error.errors[field], `${field} should be required`);
  }
});
