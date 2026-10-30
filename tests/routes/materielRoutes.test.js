'use strict';

const { before, after, beforeEach, test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'material-route-test-secret-with-more-than-32-bytes';
const ADMIN_ID = '507f1f77bcf86cd799439001';
const MANAGER_A_ID = '507f1f77bcf86cd799439002';
const MANAGER_B_ID = '507f1f77bcf86cd799439003';
const USER_ID = '507f1f77bcf86cd799439004';
const MANAGER_NO_STORE_ID = '507f1f77bcf86cd799439005';
const STORE_A = '507f1f77bcf86cd799439011';
const STORE_B = '507f1f77bcf86cd799439012';
const MATERIAL_A = '507f1f77bcf86cd799439021';
const MATERIAL_B = '507f1f77bcf86cd799439022';

let server;
let baseUrl;
let app;
let materials;
let nextId;
let createFailure;
let createCalls;
let repo;
let userRepo;
let magasinRepo;
let originals;
let originalJwtSecret;

function makeMaterial(overrides = {}) {
  return {
    _id: MATERIAL_A,
    reference: 'MAT-001',
    referenceKey: 'mat-001',
    nom: 'Perceuse',
    categorie: 'Outil',
    description: '',
    statut: 'DISPONIBLE',
    magasinId: STORE_A,
    isActive: true,
    ...overrides,
  };
}

function tokenFor(sub) {
  return jwt.sign({ sub }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

async function request(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json;
  try { json = await response.json(); } catch (_) { json = null; }
  return { status: response.status, json };
}

function assertError(result, status) {
  assert.equal(result.status, status);
  assert.equal(typeof result.json.message, 'string');
  assert.deepEqual(Object.keys(result.json), ['message']);
}

function clearAppModules() {
  for (const modulePath of [
    '../../src/app',
    '../../src/routes/index',
    '../../src/routes/materielRoutes',
    '../../src/controllers/materielController',
    '../../src/services/materielService',
    '../../src/middlewares/loadMaterielMiddleware',
    '../../src/middlewares/authMiddleware',
  ]) {
    try { delete require.cache[require.resolve(modulePath)]; } catch (_) { /* not loaded */ }
  }
}

describe('material management routes', () => {
  before(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
    clearAppModules();

    userRepo = require('../../src/repositories/userRepository');
    repo = require('../../src/repositories/materielRepository');
    magasinRepo = require('../../src/repositories/magasinRepository');
    originals = {
      findUserById: userRepo.findUserById,
      findById: repo.findById,
      findByReferenceKey: repo.findByReferenceKey,
      findMany: repo.findMany,
      create: repo.create,
      updateFields: repo.updateFields,
      setActivation: repo.setActivation,
      findMagasinById: magasinRepo.findMagasinById,
    };

    userRepo.findUserById = async (id) => ({
      _id: id,
      nom: 'Test',
      prenom: 'User',
      email: `${id}@example.test`,
      role: ({
        [ADMIN_ID]: 'Admin',
        [MANAGER_A_ID]: 'Gestionnaire',
        [MANAGER_B_ID]: 'Gestionnaire',
        [USER_ID]: 'Utilisateur',
        [MANAGER_NO_STORE_ID]: 'Gestionnaire',
      })[id],
      magasinId: id === MANAGER_A_ID ? STORE_A : id === MANAGER_B_ID ? STORE_B : null,
      isActive: true,
    });
    magasinRepo.findMagasinById = async (id) =>
      [STORE_A, STORE_B].includes(String(id)) ? { _id: id, isActive: true } : null;

    repo.findById = async (id) => materials.get(String(id)) || null;
    repo.findByReferenceKey = async (referenceKey, excludeId) => {
      for (const material of materials.values()) {
        if (material.referenceKey === referenceKey && String(material._id) !== String(excludeId)) {
          return { _id: material._id };
        }
      }
      return null;
    };
    repo.findMany = async (filter) => [...materials.values()].filter((material) =>
      material.isActive === filter.isActive &&
      (filter.magasinId === undefined || String(material.magasinId) === String(filter.magasinId))
    );
    repo.create = async (data) => {
      if (createFailure) throw createFailure;
      const material = { _id: nextId(), statut: 'DISPONIBLE', ...data };
      materials.set(String(material._id), material);
      createCalls += 1;
      return material;
    };
    repo.updateFields = async (id, updates) => {
      const material = materials.get(String(id));
      if (!material) return null;
      Object.assign(material, updates);
      return material;
    };
    repo.setActivation = async (id, isActive) => {
      const material = materials.get(String(id));
      if (!material) return null;
      material.isActive = isActive;
      return material;
    };

    app = require('../../src/app');
    await new Promise((resolve, reject) => {
      server = http.createServer(app);
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    materials = new Map([
      [MATERIAL_A, makeMaterial()],
      [MATERIAL_B, makeMaterial({
        _id: MATERIAL_B,
        reference: 'MAT-002',
        referenceKey: 'mat-002',
        magasinId: STORE_B,
        isActive: false,
        statut: 'INDISPONIBLE',
      })],
    ]);
    let counter = 30;
    nextId = () => `507f1f77bcf86cd7994390${String(counter++).padStart(2, '0')}`;
    createFailure = null;
    createCalls = 0;
  });

  after(async () => {
    if (server) {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
    Object.assign(userRepo, { findUserById: originals.findUserById });
    Object.assign(magasinRepo, { findMagasinById: originals.findMagasinById });
    Object.assign(repo, {
      findById: originals.findById,
      findByReferenceKey: originals.findByReferenceKey,
      findMany: originals.findMany,
      create: originals.create,
      updateFields: originals.updateFields,
      setActivation: originals.setActivation,
    });
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test('requires authentication and permits only Admin and Gestionnaire roles', async () => {
    assertError(await request('/api/materials', 'GET'), 401);
    assertError(await request('/api/materials', 'GET', undefined, tokenFor(USER_ID)), 403);
  });

  test('Utilisateur cannot create, update, activate, or deactivate materials', async () => {
    const token = tokenFor(USER_ID);
    assertError(await request('/api/materials', 'POST', {
      reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: STORE_A,
    }, token), 403);
    assertError(await request(`/api/materials/${MATERIAL_A}`, 'PUT', { nom: 'Scie' }, token), 403);
    assertError(await request(`/api/materials/${MATERIAL_A}/activation`, 'PATCH', { isActive: false }, token), 403);
    assertError(await request(`/api/materials/${MATERIAL_A}`, 'DELETE', undefined, token), 403);
    assert.equal(createCalls, 0);
  });

  test('Admin can create materials in a selected existing store with a normalized key', async () => {
    const result = await request('/api/materials', 'POST', {
      reference: ' MAT-003 ', nom: ' Meuleuse ', categorie: ' Outil ', magasinId: STORE_B,
    }, tokenFor(ADMIN_ID));

    assert.equal(result.status, 201);
    assert.equal(result.json.data.reference, 'MAT-003');
    assert.equal(result.json.data.referenceKey, 'mat-003');
    assert.equal(result.json.data.nom, 'Meuleuse');
    assert.equal(result.json.data.magasinId, STORE_B);
    assert.equal(result.json.data.isActive, true);
  });

  test('Gestionnaire creation uses their assigned store and rejects a body-supplied store', async () => {
    const token = tokenFor(MANAGER_A_ID);
    const created = await request('/api/materials', 'POST', {
      reference: 'MAT-003', nom: 'Meuleuse', categorie: 'Outil',
    }, token);
    assert.equal(created.status, 201);
    assert.equal(created.json.data.magasinId, STORE_A);

    const attemptedOverride = await request('/api/materials', 'POST', {
      reference: 'MAT-004', nom: 'Scie', categorie: 'Outil', magasinId: STORE_B,
    }, token);
    assertError(attemptedOverride, 400);
    assert.equal(createCalls, 1);
  });

  test('Gestionnaire without a valid assigned store cannot create or list materials', async () => {
    const token = tokenFor(MANAGER_NO_STORE_ID);
    assertError(await request('/api/materials', 'POST', {
      reference: 'MAT-005', nom: 'Scie', categorie: 'Outil',
    }, token), 403);
    assertError(await request('/api/materials', 'GET', undefined, token), 403);
  });

  test('creation rejects missing required fields and unsupported/protected fields', async () => {
    const token = tokenFor(ADMIN_ID);
    for (const body of [
      { reference: 'MAT-003', categorie: 'Outil', magasinId: STORE_A },
      { reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: STORE_A, statut: 'INDISPONIBLE' },
      { reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: STORE_A, referenceKey: 'other' },
      { reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: STORE_A, isActive: false },
    ]) assertError(await request('/api/materials', 'POST', body, token), 400);
    assert.equal(createCalls, 0);
  });

  test('creation validates the Admin store and rejects normalized duplicate references', async () => {
    const token = tokenFor(ADMIN_ID);
    assertError(await request('/api/materials', 'POST', {
      reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: '507f1f77bcf86cd799439099',
    }, token), 400);

    const duplicate = await request('/api/materials', 'POST', {
      reference: ' mat-001 ', nom: 'Scie', categorie: 'Outil', magasinId: STORE_B,
    }, token);
    assertError(duplicate, 409);
    assert.equal(createCalls, 0);
  });

  test('Admin reads across stores; Gestionnaire reads only within their assigned store', async () => {
    const adminResult = await request(`/api/materials/${MATERIAL_B}`, 'GET', undefined, tokenFor(ADMIN_ID));
    assert.equal(adminResult.status, 200);
    assert.equal(adminResult.json.data._id, MATERIAL_B);

    const sameStore = await request(`/api/materials/${MATERIAL_A}`, 'GET', undefined, tokenFor(MANAGER_A_ID));
    assert.equal(sameStore.status, 200);

    assertError(await request(`/api/materials/${MATERIAL_B}`, 'GET', undefined, tokenFor(MANAGER_A_ID)), 403);
  });

  test('Admin can update and activate a material in another store', async () => {
    const token = tokenFor(ADMIN_ID);
    const updated = await request(`/api/materials/${MATERIAL_B}`, 'PUT', { nom: 'Scie révisée' }, token);
    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.nom, 'Scie révisée');
    const activated = await request(`/api/materials/${MATERIAL_B}/activation`, 'PATCH', { isActive: true }, token);
    assert.equal(activated.status, 200);
    assert.equal(activated.json.data.isActive, true);
  });

  test('returns 400 for malformed IDs and 404 for missing materials', async () => {
    const token = tokenFor(ADMIN_ID);
    assertError(await request('/api/materials/not-an-id', 'GET', undefined, token), 400);
    assertError(await request('/api/materials/507f1f77bcf86cd799439099', 'GET', undefined, token), 404);
  });

  test('lists active materials by default and inactive materials only for isActive=false', async () => {
    const token = tokenFor(ADMIN_ID);
    const active = await request('/api/materials', 'GET', undefined, token);
    assert.equal(active.status, 200);
    assert.deepEqual(active.json.data.map((material) => material._id), [MATERIAL_A]);

    const inactive = await request('/api/materials?isActive=false', 'GET', undefined, token);
    assert.equal(inactive.status, 200);
    assert.deepEqual(inactive.json.data.map((material) => material._id), [MATERIAL_B]);
    assertError(await request('/api/materials?isActive=no', 'GET', undefined, token), 400);
    assertError(await request('/api/materials?other=true', 'GET', undefined, token), 400);
  });

  test('Gestionnaire listing is scoped to their store', async () => {
    const result = await request('/api/materials?isActive=false', 'GET', undefined, tokenFor(MANAGER_A_ID));
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.data, []);
  });

  test('updates allowed fields and derives referenceKey without permitting protected fields', async () => {
    const token = tokenFor(MANAGER_A_ID);
    const updated = await request(`/api/materials/${MATERIAL_A}`, 'PUT', {
      reference: ' New-Ref ', nom: ' Nouvel outil ',
    }, token);
    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.reference, 'New-Ref');
    assert.equal(updated.json.data.referenceKey, 'new-ref');
    assert.equal(updated.json.data.nom, 'Nouvel outil');
    assert.equal(updated.json.data.magasinId, STORE_A);

    for (const field of ['magasinId', 'isActive', 'statut', 'referenceKey', 'unknown']) {
      const body = { nom: 'Renommé', [field]: field === 'magasinId' ? STORE_B : false };
      assertError(await request(`/api/materials/${MATERIAL_A}`, 'PUT', body, token), 400);
    }
    assertError(await request(`/api/materials/${MATERIAL_B}`, 'PUT', { nom: 'Nope' }, token), 403);
  });

  test('activation endpoint accepts only a boolean isActive field', async () => {
    const token = tokenFor(MANAGER_A_ID);
    const activated = await request(`/api/materials/${MATERIAL_A}/activation`, 'PATCH', { isActive: false }, token);
    assert.equal(activated.status, 200);
    assert.equal(activated.json.data.isActive, false);
    assert.equal(activated.json.data.statut, 'DISPONIBLE');

    assertError(await request(`/api/materials/${MATERIAL_A}/activation`, 'PATCH', { isActive: 'true' }, token), 400);
    assertError(await request(`/api/materials/${MATERIAL_A}/activation`, 'PATCH', {
      isActive: true, statut: 'DISPONIBLE',
    }, token), 400);
    assertError(await request(`/api/materials/${MATERIAL_A}/activation`, 'PATCH', { isActive: true }, tokenFor(USER_ID)), 403);
    assertError(await request(`/api/materials/${MATERIAL_B}/activation`, 'PATCH', { isActive: true }, token), 403);
  });

  test('DELETE logically deactivates and retains the material and maintenance status', async () => {
    const result = await request(`/api/materials/${MATERIAL_B}`, 'DELETE', undefined, tokenFor(ADMIN_ID));
    assert.equal(result.status, 200);
    assert.equal(result.json.data.isActive, false);
    assert.equal(result.json.data.statut, 'INDISPONIBLE');
    assert.equal(materials.has(MATERIAL_B), true);
  });

  test('maps a repository duplicate-key race to HTTP 409', async () => {
    createFailure = Object.assign(new Error('Une référence matériel identique existe déjà.'), {
      statusCode: 409,
      code: 'DUPLICATE_REFERENCE',
    });
    const result = await request('/api/materials', 'POST', {
      reference: 'MAT-003', nom: 'Scie', categorie: 'Outil', magasinId: STORE_A,
    }, tokenFor(ADMIN_ID));
    assertError(result, 409);
  });
});
