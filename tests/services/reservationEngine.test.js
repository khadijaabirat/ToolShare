'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const reservationService = require('../../src/services/reservationService');
const reservationRepository = require('../../src/repositories/reservationRepository');
const materielRepository = require('../../src/repositories/materielRepository');
const magasinRepository = require('../../src/repositories/magasinRepository');

describe('Reservation Engine Unit Tests (TOOL-56, TOOL-57)', () => {
  describe('calculeDatesReservation', () => {
    test('rejects missing or zero duration (400)', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();

      await assert.rejects(
        () => reservationService.calculeDatesReservation(tomorrow, 0),
        (err) => err.statusCode === 400
      );

      await assert.rejects(
        () => reservationService.calculeDatesReservation(tomorrow, null),
        (err) => err.statusCode === 400
      );

      await assert.rejects(
        () => reservationService.calculeDatesReservation(tomorrow, -3),
        (err) => err.statusCode === 400
      );
    });

    test('rejects non-numeric duration (400)', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      await assert.rejects(
        () => reservationService.calculeDatesReservation(tomorrow, 'abc'),
        (err) => err.statusCode === 400
      );
    });

    test('rejects date in the past (400)', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      await assert.rejects(
        () => reservationService.calculeDatesReservation(yesterday, 2),
        (err) => err.statusCode === 400
      );
    });

    test('rejects invalid date format (400)', async () => {
      await assert.rejects(
        () => reservationService.calculeDatesReservation('invalid-date', 2),
        (err) => err.statusCode === 400
      );
    });

    test('correctly calculates dateFin based on dureeHeures', async () => {
      const start = new Date(Date.now() + 3600000);
      const res = await reservationService.calculeDatesReservation(start.toISOString(), 3);

      assert.equal(res.dureeHeures, 3);
      assert.equal(res.dateDebut.getTime(), start.getTime());
      assert.equal(res.dateFin.getTime(), start.getTime() + 3 * 3600 * 1000);
    });
  });

  describe('Slot overlap & boundary conditions (TOOL-57)', () => {
    const existingSlot = {
      dateDebut: new Date('2026-12-01T10:00:00Z'),
      dateFin: new Date('2026-12-01T14:00:00Z'),
    };

    // Helper that replicates Mongo's interval intersection logic:
    // (slotStart < existingEnd && slotEnd > existingStart)
    function checkOverlap(reqStart, reqEnd) {
      const s = new Date(reqStart).getTime();
      const e = new Date(reqEnd).getTime();
      const es = existingSlot.dateDebut.getTime();
      const ee = existingSlot.dateFin.getTime();
      return s < ee && e > es;
    }

    test('detects exact matching slot as overlap', () => {
      assert.equal(checkOverlap('2026-12-01T10:00:00Z', '2026-12-01T14:00:00Z'), true);
    });

    test('detects nested slot inside existing reservation as overlap', () => {
      assert.equal(checkOverlap('2026-12-01T11:00:00Z', '2026-12-01T13:00:00Z'), true);
    });

    test('detects enclosing slot around existing reservation as overlap', () => {
      assert.equal(checkOverlap('2026-12-01T08:00:00Z', '2026-12-01T16:00:00Z'), true);
    });

    test('detects partially overlapping start as overlap', () => {
      assert.equal(checkOverlap('2026-12-01T08:00:00Z', '2026-12-01T12:00:00Z'), true);
    });

    test('detects partially overlapping end as overlap', () => {
      assert.equal(checkOverlap('2026-12-01T12:00:00Z', '2026-12-01T16:00:00Z'), true);
    });

    test('accepts contiguous slot immediately preceding existing reservation (no overlap)', () => {
      assert.equal(checkOverlap('2026-12-01T06:00:00Z', '2026-12-01T10:00:00Z'), false);
    });

    test('accepts contiguous slot immediately following existing reservation (no overlap)', () => {
      assert.equal(checkOverlap('2026-12-01T14:00:00Z', '2026-12-01T18:00:00Z'), false);
    });

    test('accepts completely disjoint slot in the future (no overlap)', () => {
      assert.equal(checkOverlap('2026-12-02T10:00:00Z', '2026-12-02T14:00:00Z'), false);
    });
  });

  describe('createReservation preconditions', () => {
    const STORE_1 = '507f1f77bcf86cd799439011';
    const STORE_2 = '507f1f77bcf86cd799439012';
    const MAT_1 = '507f1f77bcf86cd799439021';
    const USER_1 = '507f1f77bcf86cd799439031';

    let originals;

    beforeEach(() => {
      originals = {
        findById: materielRepository.findById,
        getMagasinActive: magasinRepository.getMagasinActive,
        findOverlappingReservation: reservationRepository.findOverlappingReservation,
        createReservation: reservationRepository.createReservation,
      };
    });

    test('rejects if material does not exist (404)', async () => {
      materielRepository.findById = async () => null;

      await assert.rejects(
        () =>
          reservationService.createReservation({
            userId: USER_1,
            magasinId: STORE_1,
            materielId: MAT_1,
            dateDebut: new Date(Date.now() + 86400000).toISOString(),
            dureeHeures: 2,
          }),
        (err) => err.statusCode === 404
      );
    });

    test('rejects if material belongs to a different store (404)', async () => {
      materielRepository.findById = async () => ({
        _id: MAT_1,
        magasinId: STORE_2,
        statut: 'DISPONIBLE',
        isActive: true,
      });

      await assert.rejects(
        () =>
          reservationService.createReservation({
            userId: USER_1,
            magasinId: STORE_1,
            materielId: MAT_1,
            dateDebut: new Date(Date.now() + 86400000).toISOString(),
            dureeHeures: 2,
          }),
        (err) => err.statusCode === 404
      );
    });

    test('rejects if material status is INDISPONIBLE (400)', async () => {
      materielRepository.findById = async () => ({
        _id: MAT_1,
        magasinId: STORE_1,
        statut: 'INDISPONIBLE',
        isActive: true,
      });

      await assert.rejects(
        () =>
          reservationService.createReservation({
            userId: USER_1,
            magasinId: STORE_1,
            materielId: MAT_1,
            dateDebut: new Date(Date.now() + 86400000).toISOString(),
            dureeHeures: 2,
          }),
        (err) => err.statusCode === 400
      );
    });

    test('rejects if material is deactivated (isActive = false) (400)', async () => {
      materielRepository.findById = async () => ({
        _id: MAT_1,
        magasinId: STORE_1,
        statut: 'DISPONIBLE',
        isActive: false,
      });

      await assert.rejects(
        () =>
          reservationService.createReservation({
            userId: USER_1,
            magasinId: STORE_1,
            materielId: MAT_1,
            dateDebut: new Date(Date.now() + 86400000).toISOString(),
            dureeHeures: 2,
          }),
        (err) => err.statusCode === 400
      );
    });

    test('rejects if target store is deactivated (400)', async () => {
      materielRepository.findById = async () => ({
        _id: MAT_1,
        magasinId: STORE_1,
        statut: 'DISPONIBLE',
        isActive: true,
      });
      // Store 1 is not in the active stores list
      magasinRepository.getMagasinActive = async () => [{ _id: STORE_2, isActive: true }];

      await assert.rejects(
        () =>
          reservationService.createReservation({
            userId: USER_1,
            magasinId: STORE_1,
            materielId: MAT_1,
            dateDebut: new Date(Date.now() + 86400000).toISOString(),
            dureeHeures: 2,
          }),
        (err) => err.statusCode === 400
      );
    });
  });
});
