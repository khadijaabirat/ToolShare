'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeReference,
  createMaterialReferenceAudit,
} = require('../../src/utils/materialReferenceAudit');
const { auditMaterialCollection } = require('../../scripts/auditMaterialReferences');

describe('material reference audit', () => {
  test('normalizes valid strings by trimming and lowercasing', () => {
    assert.equal(normalizeReference('  MAT-001  '), 'mat-001');
    assert.equal(normalizeReference('Mat-Ä'), 'mat-ä');
  });

  test('returns null for missing and non-string references', () => {
    assert.equal(normalizeReference(undefined), null);
    assert.equal(normalizeReference(null), null);
    assert.equal(normalizeReference(123), null);
  });

  test('groups references that differ by case or surrounding whitespace', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'one', reference: 'MAT-001' });
    audit.add({ _id: 'two', reference: ' mat-001 ' });
    audit.add({ _id: 'three', reference: 'MAT-002' });

    assert.deepEqual(audit.report().duplicateGroups, [{
      referenceKey: 'mat-001',
      count: 2,
      materials: [
        { id: 'one', reference: 'MAT-001' },
        { id: 'two', reference: ' mat-001 ' },
      ],
    }]);
  });

  test('reports missing, non-string, and blank references with material IDs', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'missing' });
    audit.add({ _id: 'null', reference: null });
    audit.add({ _id: 'number', reference: 42 });
    audit.add({ _id: 'blank', reference: '  ' });

    assert.deepEqual(audit.report().invalidReferences, [
      { id: 'missing', reference: null, reason: 'missing' },
      { id: 'null', reference: null, reason: 'missing' },
      { id: 'number', reference: 42, reason: 'non-string' },
      { id: 'blank', reference: '  ', reason: 'blank' },
    ]);
  });

  test('reports missing and inconsistent referenceKey values', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'missing-key', reference: 'MAT-001' });
    audit.add({ _id: 'wrong-key', reference: 'MAT-002', referenceKey: 'mat-old' });
    audit.add({ _id: 'correct-key', reference: ' MAT-003 ', referenceKey: 'mat-003' });

    assert.deepEqual(audit.report().referenceKeyIssues, [
      {
        id: 'missing-key',
        reference: 'MAT-001',
        reason: 'missing',
        actual: null,
        expected: 'mat-001',
      },
      {
        id: 'wrong-key',
        reference: 'MAT-002',
        reason: 'inconsistent',
        actual: 'mat-old',
        expected: 'mat-002',
      },
    ]);
  });

  test('does not report a correct existing referenceKey', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'correct-key', reference: ' MAT-001 ', referenceKey: 'mat-001' });

    assert.deepEqual(audit.report().referenceKeyIssues, []);
  });

  test('reports an existing key when its reference is invalid', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'invalid-key', reference: ' ', referenceKey: 'mat-001' });

    assert.deepEqual(audit.report().referenceKeyIssues, [{
      id: 'invalid-key',
      reference: ' ',
      reason: 'inconsistent',
      actual: 'mat-001',
      expected: null,
    }]);
  });

  test('reports the number of materials scanned', () => {
    const audit = createMaterialReferenceAudit();
    audit.add({ _id: 'one', reference: 'MAT-001', referenceKey: 'mat-001' });
    audit.add({ _id: 'two', reference: 'MAT-002', referenceKey: 'mat-002' });

    assert.equal(audit.report().materialsScanned, 2);
  });

  test('does not treat a missing collection as an empty successful audit', async () => {
    let collectionAccessed = false;
    const database = {
      listCollections: () => ({ toArray: async () => [] }),
      collection: () => {
        collectionAccessed = true;
        assert.fail('must not query a collection that does not exist');
      },
    };

    await assert.rejects(
      auditMaterialCollection(database),
      (error) => error.code === 'MATERIAL_COLLECTION_NOT_FOUND'
    );
    assert.equal(collectionAccessed, false);
  });

  test('queries only the intended fields when auditing an existing collection', async () => {
    let captured;
    let cursorClosed = false;
    const database = {
      listCollections: () => ({
        toArray: async () => [{ name: 'materiels' }],
      }),
      collection: (name) => {
        assert.equal(name, 'materiels');
        return {
          find(filter, options) {
            captured = { filter, options };
            return {
              async *[Symbol.asyncIterator]() {
                yield { _id: 'one', reference: 'MAT-001', referenceKey: 'mat-001' };
              },
              async close() { cursorClosed = true; },
            };
          },
        };
      },
    };

    const report = await auditMaterialCollection(database);

    assert.deepEqual(captured, {
      filter: {},
      options: { projection: { reference: 1, referenceKey: 1 } },
    });
    assert.equal(cursorClosed, true);
    assert.equal(report.materialsScanned, 1);
    assert.deepEqual(report.invalidReferences, []);
    assert.deepEqual(report.duplicateGroups, []);
    assert.deepEqual(report.referenceKeyIssues, []);
  });
});
