'use strict';

const { before, after, beforeEach, test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'concurrency-test-secret-with-more-than-32-bytes';
const USER1_ID = '507f1f77bcf86cd799439001';
const USER2_ID = '507f1f77bcf86cd799439002';
const STORE_ID = '507f1f77bcf86cd799439011';
const MATERIAL_1 = '507f1f77bcf86cd799439021';
const MATERIAL_2 = '507f1f77bcf86cd799439022';

let server;
let baseUrl;
let reservations;
let userRepo;
let materielRepo;
let magasinRepo;
let reservationRepo;
let originals;

function tokenFor(sub) {
  return jwt.sign({ sub }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

async function createReservationRequest(body, token) {
  const response = await fetch(`${baseUrl}/api/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await response.json(); } catch (_) { json = null; }
  return { status: response.status, json };
}

describe('Reservation Concurrency Protection (TOOL-38, TOOL-39, TOOL-40)', () => {
  before(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    userRepo = require('../../src/repositories/userRepository');
    materielRepo = require('../../src/repositories/materielRepository');
    magasinRepo = require('../../src/repositories/magasinRepository');
    reservationRepo = require('../../src/repositories/reservationRepository');

    originals = {
      findUserById: userRepo.findUserById,
      findMaterielById: materielRepo.findById,
      getMagasinActive: magasinRepo.getMagasinActive,
      findOverlappingReservation: reservationRepo.findOverlappingReservation,
      createReservation: reservationRepo.createReservation,
    };

    userRepo.findUserById = async (id) => ({
      _id: id,
      nom: 'Test',
      prenom: 'User',
      email: `${id}@example.test`,
      role: 'Utilisateur',
      isActive: true,
    });

    materielRepo.findById = async (id) => {
      const idStr = String(id);
      if (idStr === MATERIAL_1 || idStr === MATERIAL_2) {
        return {
          _id: id,
          nom: `Materiel ${idStr}`,
          magasinId: STORE_ID,
          statut: 'DISPONIBLE',
          isActive: true,
        };
      }
      return null;
    };

    magasinRepo.getMagasinActive = async () => [
      { _id: STORE_ID, nom: 'Magasin Central', isActive: true },
    ];

    reservations = [];

    // Mock findOverlappingReservation with small async delay to realistically simulate DB query latency
    reservationRepo.findOverlappingReservation = async (materielId, dateDebut, dateFin) => {
      await new Promise((r) => setTimeout(r, 15));
      const mId = String(materielId);
      const start = new Date(dateDebut).getTime();
      const end = new Date(dateFin).getTime();

      return reservations.find((res) => {
        if (String(res.materielId) !== mId) return false;
        if (!['CONFIRMEE', 'EN_COURS'].includes(res.statut)) return false;
        const resStart = new Date(res.dateDebut).getTime();
        const resEnd = new Date(res.dateFin).getTime();
        return resStart < end && resEnd > start;
      }) || null;
    };

    reservationRepo.createReservation = async (data) => {
      await new Promise((r) => setTimeout(r, 15));
      const created = {
        _id: `res-${reservations.length + 1}`,
        ...data,
        statut: 'CONFIRMEE',
        createdAt: new Date(),
      };
      reservations.push(created);
      return created;
    };

    const app = require('../../src/app');
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    Object.assign(userRepo, { findUserById: originals.findUserById });
    Object.assign(materielRepo, { findById: originals.findMaterielById });
    Object.assign(magasinRepo, { getMagasinActive: originals.getMagasinActive });
    Object.assign(reservationRepo, {
      findOverlappingReservation: originals.findOverlappingReservation,
      createReservation: originals.createReservation,
    });
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    reservations = [];
  });

  test('TOOL-40: Two parallel concurrent requests for the same material slot result in exactly one 201 and one 409', async () => {
    // Tomorrow at 10:00 AM for 2 hours
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const payload = {
      magasinId: STORE_ID,
      materielId: MATERIAL_1,
      dateDebut: futureDate,
      dureeHeures: 2,
    };

    // Dispatch two concurrent HTTP requests in parallel
    const [res1, res2] = await Promise.all([
      createReservationRequest(payload, tokenFor(USER1_ID)),
      createReservationRequest(payload, tokenFor(USER2_ID)),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 409], 'Expected exactly one 201 Created and one 409 Conflict');

    const conflictRes = res1.status === 409 ? res1 : res2;
    const successRes = res1.status === 201 ? res1 : res2;

    assert.equal(successRes.json.success, true);
    assert.match(conflictRes.json.message, /réservé/i);

    // Exactly one reservation must exist in the database
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].materielId, MATERIAL_1);
  });

  test('Parallel concurrent requests for DIFFERENT materials both succeed (fine-grained resource locking)', async () => {
    const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const payload1 = {
      magasinId: STORE_ID,
      materielId: MATERIAL_1,
      dateDebut: futureDate,
      dureeHeures: 3,
    };

    const payload2 = {
      magasinId: STORE_ID,
      materielId: MATERIAL_2,
      dateDebut: futureDate,
      dureeHeures: 3,
    };

    const [res1, res2] = await Promise.all([
      createReservationRequest(payload1, tokenFor(USER1_ID)),
      createReservationRequest(payload2, tokenFor(USER2_ID)),
    ]);

    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    assert.equal(reservations.length, 2);
  });

  test('Parallel concurrent requests for the SAME material with NON-OVERLAPPING slots both succeed', async () => {
    const dayAfter = Date.now() + 72 * 3600 * 1000;
    const slot1Start = new Date(dayAfter).toISOString(); // 10:00 to 12:00
    const slot2Start = new Date(dayAfter + 4 * 3600 * 1000).toISOString(); // 14:00 to 16:00

    const payload1 = {
      magasinId: STORE_ID,
      materielId: MATERIAL_1,
      dateDebut: slot1Start,
      dureeHeures: 2,
    };

    const payload2 = {
      magasinId: STORE_ID,
      materielId: MATERIAL_1,
      dateDebut: slot2Start,
      dureeHeures: 2,
    };

    const [res1, res2] = await Promise.all([
      createReservationRequest(payload1, tokenFor(USER1_ID)),
      createReservationRequest(payload2, tokenFor(USER2_ID)),
    ]);

    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    assert.equal(reservations.length, 2);
  });
});
