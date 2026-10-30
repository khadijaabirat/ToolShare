'use strict';

function normalizeReference(reference) {
  return typeof reference === 'string'
    ? reference.trim().toLowerCase()
    : null;
}

function materialSummary(material) {
  return {
    id: material && material._id != null ? String(material._id) : null,
    reference: material && material.reference !== undefined ? material.reference : null,
  };
}

function createMaterialReferenceAudit() {
  const materialsByKey = new Map();
  const invalidReferences = [];
  const referenceKeyIssues = [];
  let materialsScanned = 0;

  function add(material) {
    materialsScanned += 1;
    const reference = material && material.reference;
    const referenceKey = normalizeReference(reference);
    const summary = materialSummary(material);
    const validReference = referenceKey !== null && referenceKey.length > 0;
    const existingReferenceKey = material ? material.referenceKey : undefined;

    if (!validReference) {
      let reason;
      if (reference === undefined || reference === null) reason = 'missing';
      else if (typeof reference !== 'string') reason = 'non-string';
      else reason = 'blank';

      invalidReferences.push({ ...summary, reason });
    } else {
      const group = materialsByKey.get(referenceKey) || [];
      group.push(summary);
      materialsByKey.set(referenceKey, group);
    }

    if (validReference && existingReferenceKey !== referenceKey) {
      referenceKeyIssues.push({
        ...summary,
        reason: existingReferenceKey === undefined || existingReferenceKey === null
          ? 'missing'
          : 'inconsistent',
        actual: existingReferenceKey === undefined ? null : existingReferenceKey,
        expected: referenceKey,
      });
    } else if (!validReference && existingReferenceKey != null) {
      referenceKeyIssues.push({
        ...summary,
        reason: 'inconsistent',
        actual: existingReferenceKey,
        expected: null,
      });
    }
  }

  function report() {
    const duplicateGroups = [];
    for (const [referenceKey, materials] of materialsByKey) {
      if (materials.length > 1) {
        duplicateGroups.push({ referenceKey, count: materials.length, materials });
      }
    }

    return { materialsScanned, invalidReferences, duplicateGroups, referenceKeyIssues };
  }

  return { add, report };
}

module.exports = { normalizeReference, createMaterialReferenceAudit };
