'use strict';

const { before, after, beforeEach, test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'reservation-test-secret-with-more-than-32-bytes';
const ADMIN_ID = '507f1f77bcf86cd799439001';
const MANAGER_A_ID = '507f1f77bcf86cd799439002';
const MANAGER_B_ID = '507f1f77bcf86cd799439003';
const USER_ID = '507f1f77bcf86cd799439004';
const STORE_A = '507f1f77bcf86cd799439011';
const STORE_B = '507f1f77bcf86cd799439012';
const MATERIAL_A = '507f1f77bcf86cd799439021';
const RESERVATION_1 = '507f1f77bcf86cd799439031';

let server;
let baseUrl;
let reservations;
let repo;
let userRepo;
let originals;

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

describe('POST /api/reservations/:id/handover (TOOL-46, TOOL-47, TOOL-48)', () => {
  before(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    userRepo = require('../../src/repositories/userRepository');
    repo = require('../../src/repositories/reservationRepository');

    originals = {
      findUserById: userRepo.findUserById,
      getReservation: repo.getReservation,
      enregistrerSortie: repo.enregistrerSortie,
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
      })[id],
      magasinId: id === MANAGER_A_ID ? STORE_A : id === MANAGER_B_ID ? STORE_B : null,
      isActive: true,
    });

    reservations = new Map();
    repo.getReservation = async (id) => reservations.get(String(id)) || null;
    repo.enregistrerSortie = async (id, dateSortie) => {
      const res = reservations.get(String(id));
      if (!res) return null;
      res.statut = 'EN_COURS';
      res.dateReelleSortie = dateSortie;
      return res;
    };

    const app = require('../../src/app');
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    Object.assign(userRepo, { findUserById: originals.findUserById });
    Object.assign(repo, {
      getReservation: originals.getReservation,
      enregistrerSortie: originals.enregistrerSortie,
    });
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    reservations.clear();
    reservations.set(RESERVATION_1, {
      _id: RESERVATION_1,
      userId: USER_ID,
      magasinId: STORE_A,
      materielId: MATERIAL_A,
      statut: 'CONFIRMEE',
      dateDebut: new Date(Date.now() + 3600000),
      dateFin: new Date(Date.now() + 7200000),
    });
  });

  test('handover requires authentication', async () => {
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST');
    assert.equal(res.status, 401);
  });

  test('Utilisateur is denied handover access (403)', async () => {
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST', {}, tokenFor(USER_ID));
    assert.equal(res.status, 403);
  });

  test('Gestionnaire of different store is denied (403)', async () => {
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST', {}, tokenFor(MANAGER_B_ID));
    assert.equal(res.status, 403);
  });

  test('Gestionnaire of same store executes handover and updates status to EN_COURS', async () => {
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST', {}, tokenFor(MANAGER_A_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.statut, 'EN_COURS');
    assert.ok(res.json.data.dateReelleSortie);
  });

  test('Admin can execute handover across any store', async () => {
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST', {}, tokenFor(ADMIN_ID));
    assert.equal(res.status, 200);
    assert.equal(res.json.data.statut, 'EN_COURS');
  });

  test('handover rejects non-existent reservation (404)', async () => {
    const res = await request('/api/reservations/507f1f77bcf86cd799439099/handover', 'POST', {}, tokenFor(ADMIN_ID));
    assert.equal(res.status, 404);
  });

  test('handover rejects already handed-over or completed reservation (400)', async () => {
    reservations.get(RESERVATION_1).statut = 'EN_COURS';
    reservations.get(RESERVATION_1).dateReelleSortie = new Date();
    const res = await request(`/api/reservations/${RESERVATION_1}/handover`, 'POST', {}, tokenFor(ADMIN_ID));
    assert.equal(res.status, 400);
  });
});