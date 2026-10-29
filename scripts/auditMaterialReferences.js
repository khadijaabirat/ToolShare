'use strict';

const mongoose = require('mongoose');
const { createMaterialReferenceAudit } = require('../src/utils/materialReferenceAudit');

const COLLECTION_NAME = 'materiels';

async function auditMaterialCollection(database) {
  const collections = await database.listCollections(
    { name: COLLECTION_NAME },
    { nameOnly: true }
  ).toArray();

  if (!collections.some((collection) => collection.name === COLLECTION_NAME)) {
    const error = new Error('Material collection does not exist; audit was not run.');
    error.code = 'MATERIAL_COLLECTION_NOT_FOUND';
    throw error;
  }

  const collection = database.collection(COLLECTION_NAME);
  const cursor = collection.find({}, {
    projection: { reference: 1, referenceKey: 1 },
  });
  const audit = createMaterialReferenceAudit();

  try {
    for await (const material of cursor) audit.add(material);
  } finally {
    await cursor.close();
  }

  return audit.report();
}

async function runAudit() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI must be set in the process environment.');
  }

  await mongoose.connect(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    const report = await auditMaterialCollection(mongoose.connection.db);
    console.log(JSON.stringify(report, null, 2));

    const hasFindings = report.invalidReferences.length > 0 ||
      report.duplicateGroups.length > 0 ||
      report.referenceKeyIssues.length > 0;
    process.exitCode = hasFindings ? 1 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  if (!process.argv.includes('--run')) {
    console.error('No database connection made. Re-run with --run and an explicitly configured MONGO_URI.');
    process.exitCode = 2;
  } else {
    runAudit().catch((error) => {
      // Do not print a driver error that could include connection details.
      const message = error && error.code === 'MATERIAL_COLLECTION_NOT_FOUND'
        ? 'Material collection does not exist; audit was not run.'
        : 'Read-only material reference audit failed.';
      console.error(message);
      process.exitCode = 1;
    });
  }
}

module.exports = { auditMaterialCollection, runAudit };
