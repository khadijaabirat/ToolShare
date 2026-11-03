'use strict';

const mongoose = require('mongoose');
const { auditMaterialCollection } = require('./auditMaterialReferences');
const { normalizeReference } = require('../src/utils/materialReferenceAudit');

const COLLECTION_NAME = 'materiels';

function hasBlockingFindings(report) {
  return report.invalidReferences.length > 0 || report.duplicateGroups.length > 0;
}

function hasAnyFindings(report) {
  return hasBlockingFindings(report) || report.referenceKeyIssues.length > 0;
}

function referenceKeyFilter(issue) {
  if (issue.actual === null) {
    return { $or: [
      { referenceKey: { $exists: false } },
      { referenceKey: null },
    ] };
  }
  return { referenceKey: issue.actual };
}

async function backfillReferenceKeys(database, report, collectionName = COLLECTION_NAME) {
  if (hasBlockingFindings(report)) {
    const error = new Error('Backfill refused: invalid or duplicate references require manual resolution.');
    error.code = 'REFERENCE_BACKFILL_BLOCKED';
    throw error;
  }

  if (report.referenceKeyIssues.length === 0) return { updated: 0 };

  const issuesById = new Map(report.referenceKeyIssues.map((issue) => [issue.id, issue]));
  const collection = database.collection(collectionName);
  let updated = 0;

  for (const [id, issue] of issuesById) {
    const expected = normalizeReference(issue.reference);
    if (!expected) {
      const error = new Error('Backfill refused: an invalid reference was found.');
      error.code = 'REFERENCE_BACKFILL_BLOCKED';
      throw error;
    }

    let result;
    try {
      result = await collection.updateOne({
        _id: new mongoose.Types.ObjectId(id),
        reference: issue.reference,
        ...referenceKeyFilter(issue),
      }, { $set: { referenceKey: expected } });
    } catch (_error) {
      const error = new Error('Backfill stopped after a database write error.');
      error.code = 'REFERENCE_BACKFILL_FAILED';
      error.completedUpdates = updated;
      throw error;
    }

    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      const error = new Error('Backfill stopped because a material changed or did not match the audited values.');
      error.code = 'REFERENCE_BACKFILL_CONCURRENT_CHANGE';
      error.completedUpdates = updated;
      throw error;
    }
    updated += 1;
  }

  return { updated };
}

function sameIndexKey(key, expected) {
  const keys = Object.entries(key || {});
  return keys.length === 1 && keys[0][0] === expected && keys[0][1] === 1;
}

function hasSimpleCollation(index) {
  if (!Object.prototype.hasOwnProperty.call(index, 'collation')) return true;
  const collation = index.collation;
  return Boolean(collation && collation.locale === 'simple' &&
    Object.keys(collation).every((key) => key === 'locale'));
}

function isExpectedReferenceIndex(index) {
  const allowedOptions = new Set(['v', 'key', 'name', 'unique', 'collation']);
  return sameIndexKey(index.key, 'referenceKey') &&
    index.unique === true &&
    hasSimpleCollation(index) &&
    !Object.prototype.hasOwnProperty.call(index, 'expireAfterSeconds') &&
    !Object.prototype.hasOwnProperty.call(index, 'sparse') &&
    !Object.prototype.hasOwnProperty.call(index, 'partialFilterExpression') &&
    Object.keys(index).every((option) => allowedOptions.has(option));
}

function concernsReferenceKey(index) {
  return Object.prototype.hasOwnProperty.call(index.key || {}, 'referenceKey');
}

async function ensureGlobalUniqueReferenceIndex(collection) {
  const indexes = await collection.listIndexes().toArray();
  const conflicting = indexes.find((index) =>
    concernsReferenceKey(index) && !isExpectedReferenceIndex(index)
  );
  if (conflicting) {
    const error = new Error('An unexpected index involving referenceKey exists; manual index review is required.');
    error.code = 'REFERENCE_INDEX_CONFLICT';
    throw error;
  }

  const existing = indexes.find(isExpectedReferenceIndex);
  if (!existing) {
    await collection.createIndex({ referenceKey: 1 }, { unique: true });
  }

  const verifiedIndexes = await collection.listIndexes().toArray();
  const verified = verifiedIndexes.find(isExpectedReferenceIndex);
  if (!verified) {
    const error = new Error('MongoDB did not report the expected unique referenceKey index after creation.');
    error.code = 'REFERENCE_INDEX_VERIFICATION_FAILED';
    throw error;
  }
  return verified;
}

function parseOptions(args) {
  const modes = ['--dry-run', '--backfill', '--create-index'].filter((mode) => args.includes(mode));
  if (!args.includes('--run') || modes.length !== 1) {
    throw new Error('Specify --run and exactly one of --dry-run, --backfill, or --create-index.');
  }
  const confirmation = args.find((arg) => arg.startsWith('--confirm-db='));
  const mode = modes[0].slice(2);
  if (mode !== 'dry-run' && !confirmation) {
    throw new Error('Database-changing modes require --confirm-db=<database-name>.');
  }
  return { mode, confirmedDatabase: confirmation ? confirmation.slice('--confirm-db='.length) : null };
}

function verifyTargetDatabase(uri, confirmedDatabase, changing) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (_error) {
    throw new Error('MONGO_URI must be a valid MongoDB URI.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error('MONGO_URI must name a target database.');
  if (changing && (!confirmedDatabase || confirmedDatabase !== databaseName)) {
    throw new Error('Confirmed database name does not match the database named in MONGO_URI.');
  }
  return databaseName;
}

async function runRollout(options, env = process.env) {
  if (!options || !['dry-run', 'backfill', 'create-index'].includes(options.mode)) {
    throw new Error('A valid rollout mode is required.');
  }
  const uri = env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI must be set in the process environment.');
  const changing = options.mode === 'backfill' || options.mode === 'create-index';
  verifyTargetDatabase(uri, options.confirmedDatabase, changing);

  await mongoose.connect(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    const database = mongoose.connection.db;
    const collectionName = options.collectionName || COLLECTION_NAME;
    const report = await auditMaterialCollection(database, collectionName);
    console.log(JSON.stringify({ mode: options.mode, audit: report }, null, 2));

    if (options.mode === 'dry-run') {
      process.exitCode = hasAnyFindings(report) ? 1 : 0;
      return;
    }
    if (options.mode === 'backfill') {
      const result = await backfillReferenceKeys(database, report, collectionName);
      const finalReport = await auditMaterialCollection(database, collectionName);
      console.log(JSON.stringify({ backfill: result, finalAudit: finalReport }, null, 2));
      if (hasAnyFindings(finalReport)) {
        throw new Error('Backfill completed but the complete audit still has findings; index creation is blocked.');
      }
      return;
    }

    if (hasAnyFindings(report)) {
      const error = new Error('Index creation refused: resolve all audit findings first.');
      error.code = 'REFERENCE_INDEX_AUDIT_BLOCKED';
      throw error;
    }
    const index = await ensureGlobalUniqueReferenceIndex(database.collection(collectionName));
    console.log(JSON.stringify({ verifiedIndex: { name: index.name, key: index.key, unique: index.unique } }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  try {
    const options = parseOptions(process.argv.slice(2));
    runRollout(options).catch((error) => {
      const safeMessage = error && [
        'REFERENCE_BACKFILL_BLOCKED',
        'REFERENCE_BACKFILL_FAILED',
        'REFERENCE_BACKFILL_CONCURRENT_CHANGE',
        'REFERENCE_INDEX_CONFLICT',
        'REFERENCE_INDEX_VERIFICATION_FAILED',
        'REFERENCE_INDEX_AUDIT_BLOCKED',
        'MATERIAL_COLLECTION_NOT_FOUND',
      ].includes(error.code)
        ? error.message
        : 'Material reference rollout failed; inspect the target database before retrying.';
      if (error && Number.isInteger(error.completedUpdates)) {
        console.error(`${safeMessage} Acknowledged guarded updates before failure (not necessarily total applied): ${error.completedUpdates}.`);
      } else {
        console.error(safeMessage);
      }
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  hasAnyFindings,
  parseOptions,
  runRollout,
  verifyTargetDatabase,
};
