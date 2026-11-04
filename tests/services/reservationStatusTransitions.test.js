'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const reservationService = require('../../src/services/reservationService');
const reservationRepository = require('../../src/repositories/reservationRepository');
const materielRepository = require('../../src/repositories/materielRepository');

const USER_ID = '507f1f77bcf86cd799439001';
const OTHER_USER_ID = '507f1f77bcf86cd799439002';
const STORE_A = '507f1f77bcf86cd799439011';
const STORE_B = '507f1f77bcf86cd799439012';
const MATERIAL_1 = '507f1f77bcf86cd799439021';
const RESERVATION_ID = '507f1f77bcf86cd799439031';

describe('Reservation Status Transitions Unit Tests (TOOL-56, TOOL-58)', () => {
  let reservationsDb;
  let materialsDb;
  let originals;

  beforeEach(() => {
    reservationsDb = new Map();
    materialsDb = new Map();

    originals = {
      getReservation: reservationRepository.getReservation,
      annulerReservation: reservationRepository.annulerReservation,
      enregistrerSortie: reservationRepository.enregistrerSortie,
      enregistrerRetour: reservationRepository.enregistrerRetour,
      findOverdueBorrowings: reservationRepository.findOverdueBorrowings,
      findById: materielRepository.findById,
      updateFields: materielRepository.updateFields,
    };

    materialsDb.set(MATERIAL_1, {
      _id: MATERIAL_1,
      nom: 'Scie circulaire',
      magasinId: STORE_A,
      statut: 'DISPONIBLE',
      isActive: true,
    });

    reservationsDb.set(RESERVATION_ID, {
      _id: RESERVATION_ID,
      userId: USER_ID,
      magasinId: STORE_A,
      materielId: MATERIAL_1,
      statut: 'CONFIRMEE',
      dateDebut: new Date(Date.now() + 86400000), // tomorrow
      dateFin: new Date(Date.now() + 90000000),
      dureeHeures: 1,
    });

    reservationRepository.getReservation = async (id) => reservationsDb.get(String(id)) || null;

    reservationRepository.annulerReservation = async (id) => {
      const res = reservationsDb.get(String(id));
      if (!res) return null;
      res.statut = 'ANNULEE';
      return res;
    };

    reservationRepository.enregistrerSortie = async (id, dateSortie) => {
      const res = reservationsDb.get(String(id));
      if (!res) return null;
      res.statut = 'EN_COURS';
      res.dateReelleSortie = dateSortie;
      return res;
    };

    materielRepository.findById = async (id) => materialsDb.get(String(id)) || null;
    materielRepository.updateFields = async (id, statut) => {
      const mat = materialsDb.get(String(id));
      if (mat) mat.statut = statut;
      return mat;
    };
  });

  describe('Transition CONFIRMEE -> ANNULEE', () => {
    test('rejects cancellation of non-existent reservation (404)', async () => {
      await assert.rejects(
        () => reservationService.annulationReservation('non-existent-id', USER_ID),
        (err) => err.statusCode === 404
      );
    });

    test('rejects cancellation by a user who is not the reservation owner (400)', async () => {
      await assert.rejects(
        () => reservationService.annulationReservation(RESERVATION_ID, OTHER_USER_ID),
        (err) => err.statusCode === 400
      );
    });

    test('rejects cancellation when start date is in the past (400)', async () => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.dateDebut = new Date(Date.now() - 3600000); // 1 hour ago

      await assert.rejects(
        () => reservationService.annulationReservation(RESERVATION_ID, USER_ID),
        (err) => err.statusCode === 400
      );
    });

    test('rejects cancellation when reservation is already EN_COURS or TERMINEE (400)', async () => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.statut = 'EN_COURS';

      await assert.rejects(
        () => reservationService.annulationReservation(RESERVATION_ID, USER_ID),
        (err) => err.statusCode === 400
      );
    });

    test('successfully cancels a valid confirmed reservation', async () => {
      const cancelled = await reservationService.annulationReservation(RESERVATION_ID, USER_ID);
      assert.equal(cancelled.statut, 'ANNULEE');
    });
  });

  describe('Transition CONFIRMEE -> EN_COURS (Handover / Remise)', () => {
    const managerA = { id: 'mgr1', role: 'Gestionnaire', magasinId: STORE_A };
    const managerB = { id: 'mgr2', role: 'Gestionnaire', magasinId: STORE_B };
    const admin = { id: 'admin1', role: 'Admin' };

    test('rejects handover by Gestionnaire of a different store (403)', async () => {
      await assert.rejects(
        () => reservationService.enregistrerSortie(RESERVATION_ID, managerB),
        (err) => err.statusCode === 403
      );
    });

    test('rejects handover if reservation is not CONFIRMEE (400)', async () => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.statut = 'ANNULEE';

      await assert.rejects(
        () => reservationService.enregistrerSortie(RESERVATION_ID, managerA),
        (err) => err.statusCode === 400
      );
    });

    test('rejects handover if material is already marked as departed (400)', async () => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.dateReelleSortie = new Date();

      await assert.rejects(
        () => reservationService.enregistrerSortie(RESERVATION_ID, managerA),
        (err) => err.statusCode === 400
      );
    });

    test('successfully records departure by Gestionnaire of the assigned store', async () => {
      const updated = await reservationService.enregistrerSortie(RESERVATION_ID, managerA);
      assert.equal(updated.statut, 'EN_COURS');
      assert.ok(updated.dateReelleSortie instanceof Date);
    });

    test('successfully records departure by Admin', async () => {
      const updated = await reservationService.enregistrerSortie(RESERVATION_ID, admin);
      assert.equal(updated.statut, 'EN_COURS');
      assert.ok(updated.dateReelleSortie instanceof Date);
    });
  });

  describe('Transition EN_COURS -> TERMINEE (Return & Condition)', () => {
    const managerA = { id: 'mgr1', role: 'Gestionnaire', magasinId: STORE_A };
    const managerB = { id: 'mgr2', role: 'Gestionnaire', magasinId: STORE_B };

    beforeEach(() => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.statut = 'EN_COURS';
      res.dateReelleSortie = new Date(Date.now() - 3600000);
    });

    test('rejects return if etatRetour is missing (400)', async () => {
      await assert.rejects(
        () => reservationService.enregistrerRetour(RESERVATION_ID, managerA, null),
        (err) => err.statusCode === 400
      );
    });

    test('rejects return by Gestionnaire of a different store (403)', async () => {
      await assert.rejects(
        () => reservationService.enregistrerRetour(RESERVATION_ID, managerB, 'BON_ETAT'),
        (err) => err.statusCode === 403
      );
    });

    test('rejects return if reservation is already TERMINEE or ANNULEE (403)', async () => {
      const res = reservationsDb.get(RESERVATION_ID);
      res.statut = 'TERMINEE';

      await assert.rejects(
        () => reservationService.enregistrerRetour(RESERVATION_ID, managerA, 'BON_ETAT'),
        (err) => err.statusCode === 403
      );
    });

    test('records return with etat ENDOMMAGE and marks material INDISPONIBLE', async () => {
      reservationRepository.enregistrerRetour = async (id, { dateReelleRetour, etatRetour }) => {
        const res = reservationsDb.get(String(id));
        res.statut = 'TERMINEE';
        res.etatRetour = etatRetour;
        res.dateReelleDeReteur = dateReelleRetour;
        const mat = materialsDb.get(res.materielId);
        mat.statut = 'INDISPONIBLE';
        return res;
      };

      const returned = await reservationService.enregistrerRetour(RESERVATION_ID, managerA, 'ENDOMMAGE');
      assert.equal(returned.statut, 'TERMINEE');
      assert.equal(returned.etatRetour, 'ENDOMMAGE');
      assert.equal(materialsDb.get(MATERIAL_1).statut, 'INDISPONIBLE');
    });

    test('records return with BON_ETAT and maintains DISPONIBLE status', async () => {
      reservationRepository.enregistrerRetour = async (id, { dateReelleRetour, etatRetour }) => {
        const res = reservationsDb.get(String(id));
        res.statut = 'TERMINEE';
        res.etatRetour = etatRetour;
        res.dateReelleDeReteur = dateReelleRetour;
        const mat = materialsDb.get(res.materielId);
        if (mat.statut !== 'INDISPONIBLE') mat.statut = 'DISPONIBLE';
        return res;
      };

      const returned = await reservationService.enregistrerRetour(RESERVATION_ID, managerA, 'BON_ETAT');
      assert.equal(returned.statut, 'TERMINEE');
      assert.equal(returned.etatRetour, 'BON_ETAT');
      assert.equal(materialsDb.get(MATERIAL_1).statut, 'DISPONIBLE');
    });

    test('records return with BON_ETAT and preserves existing maintenance INDISPONIBLE status', async () => {
      // Material was put into maintenance by manager
      materialsDb.get(MATERIAL_1).statut = 'INDISPONIBLE';

      reservationRepository.enregistrerRetour = async (id, { dateReelleRetour, etatRetour }) => {
        const res = reservationsDb.get(String(id));
        res.statut = 'TERMINEE';
        res.etatRetour = etatRetour;
        res.dateReelleDeReteur = dateReelleRetour;
        const mat = materialsDb.get(res.materielId);
        if (mat.statut !== 'INDISPONIBLE') mat.statut = 'DISPONIBLE';
        return res;
      };

      await reservationService.enregistrerRetour(RESERVATION_ID, managerA, 'BON_ETAT');
      // Must remain INDISPONIBLE because manager had set maintenance
      assert.equal(materialsDb.get(MATERIAL_1).statut, 'INDISPONIBLE');
    });
  });
});
