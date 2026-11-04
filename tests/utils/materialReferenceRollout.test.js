'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const rollout = require('../../scripts/rolloutMaterialReferenceIndex');

const TEST_URI = 'mongodb://localhost:27017/toolshare_test';
const TEST_DATABASE = 'toolshare_test';

function createDatabase(materials = [], indexes = [{ name: '_id_', key: { _id: 1 }, unique: true }]) {
  const collection = {
    find() {
      return {
        async *[Symbol.asyncIterator]() {
          for (const material of materials) yield material;
        },
        async close() {},
      };
    },
    async updateOne(filter, update) {
      const material = materials.find((candidate) =>
        String(candidate._id) === String(filter._id) &&
        candidate.reference === filter.reference
      );
      if (!material) return { matchedCount: 0, modifiedCount: 0 };
      const keyMatches = filter.$or
        ? filter.$or.some((condition) =>
          condition.referenceKey && condition.referenceKey.$exists === false
            ? !Object.prototype.hasOwnProperty.call(material, 'referenceKey')
            : material.referenceKey === condition.referenceKey
        )
        : material.referenceKey === filter.referenceKey;
      if (!keyMatches) return { matchedCount: 0, modifiedCount: 0 };
      material.referenceKey = update.$set.referenceKey;
      return { matchedCount: 1, modifiedCount: 1 };
    },
    listIndexes() {
      return { toArray: async () => indexes };
    },
    async createIndex(key, options) {
      indexes.push({ name: 'referenceKey_1', key, unique: options.unique });
      return 'referenceKey_1';
    },
  };

  return {
    indexes,
    collection(name) {
      assert.equal(name, 'materiels');
      return collection;
    },
    listCollections: () => ({ toArray: async () => [{ name: 'materiels' }] }),
  };
}

async function withFakeDatabase(database, callback) {
  const previousConnect = mongoose.connect;
  const previousDisconnect = mongoose.disconnect;
  const previousDatabase = mongoose.connection.db;
  const previousLog = console.log;
  let connectCalls = 0;
  mongoose.connect = async () => {
    connectCalls += 1;
    mongoose.connection.db = database;
    return mongoose;
  };
  mongoose.disconnect = async () => {
    mongoose.connection.db = previousDatabase;
  };
  console.log = () => {};
  try {
    return await callback(() => connectCalls);
  } finally {
    mongoose.connect = previousConnect;
    mongoose.disconnect = previousDisconnect;
    mongoose.connection.db = previousDatabase;
    console.log = previousLog;
  }
}

function authorizedOptions(mode, extra = {}) {
  return { mode, confirmedDatabase: TEST_DATABASE, ...extra };
}

async function invoke(mode, database, extraOptions = {}) {
  return withFakeDatabase(database, () => rollout.runRollout(
    authorizedOptions(mode, extraOptions),
    { MONGO_URI: TEST_URI }
  ));
}

describe('material reference index rollout', () => {
  test('does not expose mutating helpers and rejects calls without valid authorization before connecting', async () => {
    assert.equal(Object.hasOwn(rollout, 'backfillReferenceKeys'), false);
    assert.equal(Object.hasOwn(rollout, 'ensureGlobalUniqueReferenceIndex'), false);

    const database = createDatabase();
    await withFakeDatabase(database, async (getConnectCalls) => {
      await assert.rejects(
        rollout.runRollout({ mode: 'create-index' }, { MONGO_URI: TEST_URI }),
        /Confirmed database name does not match/
      );
      await assert.rejects(
        rollout.runRollout({ mode: 'unknown', confirmedDatabase: TEST_DATABASE }, { MONGO_URI: TEST_URI }),
        /valid rollout mode/
      );
      await assert.rejects(
        rollout.runRollout({ mode: 'backfill', confirmedDatabase: 'wrong-db' }, { MONGO_URI: TEST_URI }),
        /does not match/
      );
      assert.equal(getConnectCalls(), 0);
    });
  });

  test('requires CLI --run and exactly one valid mode', () => {
    assert.deepEqual(rollout.parseOptions(['--run', '--dry-run']), {
      mode: 'dry-run', confirmedDatabase: null,
    });
    assert.throws(() => rollout.parseOptions(['--dry-run']), /--run/);
    assert.throws(() => rollout.parseOptions(['--run', '--backfill']), /--confirm-db/);
    assert.deepEqual(rollout.parseOptions([
      '--run', '--backfill', '--confirm-db=toolshare_test',
    ]), { mode: 'backfill', confirmedDatabase: TEST_DATABASE });
    assert.equal(rollout.verifyTargetDatabase(TEST_URI, TEST_DATABASE, true), TEST_DATABASE);
    assert.throws(
      () => rollout.verifyTargetDatabase(TEST_URI, 'another-db', true),
      /does not match/
    );
  });

  test('refuses backfill before writing when invalid references or duplicates exist', async () => {
    for (const materials of [
      [{ _id: new mongoose.Types.ObjectId(), reference: ' ', referenceKey: 'old' }],
      [
        { _id: new mongoose.Types.ObjectId(), reference: 'TOOL-X' },
        { _id: new mongoose.Types.ObjectId(), reference: ' tool-x ' },
      ],
    ]) {
      const database = createDatabase(materials);
      let writes = 0;
      const collection = database.collection('materiels');
      const updateOne = collection.updateOne;
      collection.updateOne = async (...args) => {
        writes += 1;
        return updateOne(...args);
      };
      await assert.rejects(
        invoke('backfill', database),
        (error) => error.code === 'REFERENCE_BACKFILL_BLOCKED'
      );
      assert.equal(writes, 0);
    }
  });

  test('repairs missing and inconsistent keys only, preserving original references', async () => {
    const materials = [
      { _id: new mongoose.Types.ObjectId(), reference: '  TOOL-X  ' },
      { _id: new mongoose.Types.ObjectId(), reference: 'TOOL-Y', referenceKey: 'old-key' },
    ];
    const database = createDatabase(materials);
    await invoke('backfill', database);
    assert.deepEqual(materials.map((material) => material.referenceKey), ['tool-x', 'tool-y']);
    assert.deepEqual(materials.map((material) => material.reference), ['  TOOL-X  ', 'TOOL-Y']);
  });

  test('accepts the intended unique index and preserves unrelated indexes', async () => {
    const referenceIndex = { name: 'reference_1', key: { reference: 1 }, unique: true };
    const intendedIndex = {
      name: 'referenceKey_1', key: { referenceKey: 1 }, unique: true, v: 2,
      collation: { locale: 'simple' },
    };
    const database = createDatabase([
      { _id: new mongoose.Types.ObjectId(), reference: 'TOOL-X', referenceKey: 'tool-x' },
    ], [referenceIndex, intendedIndex]);
    await invoke('create-index', database);
    assert.deepEqual(database.indexes, [referenceIndex, intendedIndex]);
  });

  test('creates the intended index when none exists', async () => {
    const database = createDatabase([
      { _id: new mongoose.Types.ObjectId(), reference: 'TOOL-X', referenceKey: 'tool-x' },
    ]);
    await invoke('create-index', database);
    const created = database.indexes.find((index) => index.key.referenceKey === 1);
    assert.deepEqual(created, {
      name: 'referenceKey_1', key: { referenceKey: 1 }, unique: true,
    });
  });

  test('rejects non-simple collation, TTL, sparse, partial, wrong-key, and non-unique indexes', async () => {
    const unexpectedIndexes = [
      { key: { referenceKey: 1 }, unique: true, collation: { locale: 'en', strength: 2 } },
      { key: { referenceKey: 1 }, unique: true, expireAfterSeconds: 3600 },
      { key: { referenceKey: 1 }, unique: true, sparse: true },
      { key: { referenceKey: 1 }, unique: true, partialFilterExpression: { isActive: true } },
      { key: { referenceKey: -1 }, unique: true },
      { key: { magasinId: 1, referenceKey: 1 }, unique: true },
      { key: { referenceKey: 1 } },
    ];
    for (const definition of unexpectedIndexes) {
      const database = createDatabase([
        { _id: new mongoose.Types.ObjectId(), reference: 'TOOL-X', referenceKey: 'tool-x' },
      ], [{ name: 'unexpected', ...definition }]);
      await assert.rejects(
        invoke('create-index', database),
        (error) => error.code === 'REFERENCE_INDEX_CONFLICT'
      );
      assert.equal(database.indexes.length, 1, 'conflicting indexes must not be replaced');
    }
  });
});
