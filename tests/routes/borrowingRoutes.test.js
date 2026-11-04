'use strict';

const { before, after, beforeEach, test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'borrowing-test-secret-with-more-than-32-bytes';
const ADMIN_ID = '507f1f77bcf86cd799439001';
const MANAGER_A_ID = '507f1f77bcf86cd799439002';
const MANAGER_B_ID = '507f1f77bcf86cd799439003';
const MANAGER_NO_STORE_ID = '507f1f77bcf86cd799439005';
const USER_ID = '507f1f77bcf86cd799439004';

const STORE_A = '507f1f77bcf86cd799439011';
const STORE_B = '507f1f77bcf86cd799439012';

const MATERIAL_A = '507f1f77bcf86cd799439021';
const MATERIAL_B = '507f1f77bcf86cd799439022';

let server;
let baseUrl;
let borrowingsData;
let repo;
let userRepo;
let originals;

function tokenFor(sub) {
  return jwt.sign({ sub }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

async function request(path, method = 'GET', body, token) {
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

describe('GET /api/borrowings/overdue (TOOL-52, TOOL-53)', () => {
  before(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    userRepo = require('../../src/repositories/userRepository');
    repo = require('../../src/repositories/reservationRepository');

    originals = {
      findUserById: userRepo.findUserById,
      findOverdueBorrowings: repo.findOverdueBorrowings,
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
        [MANAGER_NO_STORE_ID]: 'Gestionnaire',
        [USER_ID]: 'Utilisateur',
      })[id],
      magasinId: id === MANAGER_A_ID ? STORE_A : id === MANAGER_B_ID ? STORE_B : null,
      isActive: true,
    });

    borrowingsData = [];

    repo.findOverdueBorrowings = async (query = {}) => {
      const now = new Date();
      return borrowingsData.filter((item) => {
        if (query.magasinId && String(item.magasinId) !== String(query.magasinId)) {
          return false;
        }
        if (item.statut !== 'EN_COURS') {
          return false;
        }
        if (new Date(item.dateFin) >= now) {
          return false;
        }
        return true;
      });
    };

    const app = require('../../src/app');
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    Object.assign(userRepo, { findUserById: originals.findUserById });
    Object.assign(repo, { findOverdueBorrowings: originals.findOverdueBorrowings });
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    const now = Date.now();
    borrowingsData = [
      // Overdue in Store A (ended 2 hours ago)
      {
        _id: '507f1f77bcf86cd799439101',
        userId: { _id: USER_ID, nom: 'Alaoui', prenom: 'Ahmed', email: 'ahmed@test.ma' },
        materielId: { _id: MATERIAL_A, nom: 'Perforateur Hilti', reference: 'PERF-001' },
        magasinId: STORE_A,
        statut: 'EN_COURS',
        dateDebut: new Date(now - 7200000),
        dateFin: new Date(now - 3600000),
        dateReelleSortie: new Date(now - 7200000),
      },
      // Overdue in Store B (ended 5 hours ago)
      {
        _id: '507f1f77bcf86cd799439102',
        userId: { _id: USER_ID, nom: 'Bennani', prenom: 'Karim', email: 'karim@test.ma' },
        materielId: { _id: MATERIAL_B, nom: 'Meuleuse Bosch', reference: 'MEUL-002' },
        magasinId: STORE_B,
        statut: 'EN_COURS',
        dateDebut: new Date(now - 18000000),
        dateFin: new Date(now - 7200000),
        dateReelleSortie: new Date(now - 18000000),
      },
      // Active borrowing, NOT overdue (ends in 2 hours)
      {
        _id: '507f1f77bcf86cd799439103',
        userId: { _id: USER_ID, nom: 'Alaoui', prenom: 'Ahmed', email: 'ahmed@test.ma' },
        materielId: { _id: MATERIAL_A, nom: 'Perforateur Hilti', reference: 'PERF-001' },
        magasinId: STORE_A,
        statut: 'EN_COURS',
        dateDebut: new Date(now - 3600000),
        dateFin: new Date(now + 7200000),
        dateReelleSortie: new Date(now - 3600000),
      },
      // Returned already (TERMINEE)
      {
        _id: '507f1f77bcf86cd799439104',
        userId: { _id: USER_ID, nom: 'Alaoui', prenom: 'Ahmed', email: 'ahmed@test.ma' },
        materielId: { _id: MATERIAL_A, nom: 'Perforateur Hilti', reference: 'PERF-001' },
        magasinId: STORE_A,
        statut: 'TERMINEE',
        dateDebut: new Date(now - 14400000),
        dateFin: new Date(now - 7200000),
        dateReelleSortie: new Date(now - 14400000),
        dateReelleDeReteur: new Date(now - 7000000),
      },
    ];
  });

  test('overdue borrowings endpoint requires authentication (401)', async () => {
    const res = await request('/api/borrowings/overdue');
    assert.equal(res.status, 401);
  });

  test('Utilisateur role is forbidden (403)', async () => {
    const res = await request('/api/borrowings/overdue', 'GET', undefined, tokenFor(USER_ID));
    assert.equal(res.status, 403);
  });

  test('Gestionnaire without assigned store is rejected (403)', async () => {
    const res = await request('/api/borrowings/overdue', 'GET', undefined, tokenFor(MANAGER_NO_STORE_ID));
    assert.equal(res.status, 403);
  });

  test('Gestionnaire receives only overdue borrowings for their assigned store', async () => {
    const res = await request('/api/borrowings/overdue', 'GET', undefined, tokenFor(MANAGER_A_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 1);
    assert.equal(res.json.data.length, 1);
    assert.equal(res.json.data[0]._id, '507f1f77bcf86cd799439101');
    assert.equal(res.json.data[0].magasinId, STORE_A);
    assert.equal(res.json.data[0].enRetard, true);
    assert.equal(res.json.data[0].isOverdue, true);
    assert.ok(res.json.data[0].retardMinutes > 0);
  });

  test('Admin receives all overdue borrowings across all stores', async () => {
    const res = await request('/api/borrowings/overdue', 'GET', undefined, tokenFor(ADMIN_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 2);
    assert.equal(res.json.data.length, 2);
    const ids = res.json.data.map((d) => d._id);
    assert.ok(ids.includes('507f1f77bcf86cd799439101'));
    assert.ok(ids.includes('507f1f77bcf86cd799439102'));
  });

  test('Admin can filter overdue borrowings by magasinId', async () => {
    const res = await request(`/api/borrowings/overdue?magasinId=${STORE_B}`, 'GET', undefined, tokenFor(ADMIN_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 1);
    assert.equal(res.json.data[0].magasinId, STORE_B);
  });

  test('GET /api/reservations/overdue alias also works correctly', async () => {
    const res = await request('/api/reservations/overdue', 'GET', undefined, tokenFor(MANAGER_A_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.count, 1);
    assert.equal(res.json.data[0]._id, '507f1f77bcf86cd799439101');
  });
});
