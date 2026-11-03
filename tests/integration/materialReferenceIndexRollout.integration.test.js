'use strict';

const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { runRollout } = require('../../scripts/rolloutMaterialReferenceIndex');

const TEST_DATABASE_NAME = 'toolshare_test';
const mongoTestUri = process.env.MONGO_TEST_URI;
const testDatabaseConfirmation = process.env.MONGO_TEST_DATABASE_CONFIRMATION;

function assertIsolatedTestUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (_error) {
    throw new Error('MONGO_TEST_URI must be a valid URI for the local toolshare_test database.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (databaseName !== TEST_DATABASE_NAME || !allowedHosts.has(parsed.hostname)) {
    throw new Error('MONGO_TEST_URI must target the local toolshare_test database; refusing other targets.');
  }
}

if (mongoTestUri) assertIsolatedTestUri(mongoTestUri);

test('backfills eligible keys and proves MongoDB enforces global uniqueness', {
  skip: mongoTestUri ? false : 'Set MONGO_TEST_URI to a local toolshare_test MongoDB database.',
}, async () => {
  if (testDatabaseConfirmation !== TEST_DATABASE_NAME) {
    throw new Error('Set MONGO_TEST_DATABASE_CONFIRMATION=toolshare_test to authorize test database writes.');
  }
  const collectionName = `reference_rollout_${randomUUID().replaceAll('-', '')}`;
  const firstId = new mongoose.Types.ObjectId();
  const authorizedOptions = { mode: 'backfill', confirmedDatabase: TEST_DATABASE_NAME, collectionName };
  const testEnvironment = { MONGO_URI: mongoTestUri };
  let collectionCreated = false;

  try {
    await mongoose.connect(mongoTestUri, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    let database = mongoose.connection.db;
    let collection = database.collection(collectionName);
    await collection.insertOne({
      _id: firstId,
      reference: '  TOOL-ROLL-001  ',
      nom: 'Integration material',
      magasinId: new mongoose.Types.ObjectId(),
    });
    collectionCreated = true;
    await mongoose.disconnect();

    await runRollout(authorizedOptions, testEnvironment);
    await runRollout({ ...authorizedOptions, mode: 'create-index' }, testEnvironment);

    await mongoose.connect(mongoTestUri, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    database = mongoose.connection.db;
    collection = database.collection(collectionName);
    const persisted = await collection.findOne({ _id: firstId });
    assert.equal(persisted.reference, '  TOOL-ROLL-001  ');
    assert.equal(persisted.referenceKey, 'tool-roll-001');
    const index = (await collection.listIndexes().toArray()).find((candidate) =>
      candidate.key.referenceKey === 1
    );
    assert.ok(index);
    assert.equal(index.unique, true);

    await assert.rejects(
      collection.insertOne({
        reference: 'TOOL-ROLL-DUPLICATE',
        referenceKey: 'tool-roll-001',
        nom: 'Duplicate across another store',
        magasinId: new mongoose.Types.ObjectId(),
      }),
      (error) => error.code === 11000
    );
  } finally {
    try {
      if (collectionCreated) {
        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(mongoTestUri, {
            autoIndex: false,
            autoCreate: false,
            serverSelectionTimeoutMS: 5000,
          });
        }
        await mongoose.connection.db.dropCollection(collectionName);
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});
