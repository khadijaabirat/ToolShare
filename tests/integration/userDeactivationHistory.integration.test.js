'use strict';

const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Reservation = require('../../src/models/Reservation');
const userService = require('../../src/services/userService');
const { hashPassword } = require('../../src/utils/password');

const TEST_DATABASE_NAME = 'toolshare_test';
const mongoTestUri = process.env.MONGO_TEST_URI;

function assertIsolatedTestUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (_error) {
    throw new Error('MONGO_TEST_URI must be a valid MongoDB URI for the isolated toolshare_test database.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (databaseName !== TEST_DATABASE_NAME || !allowedHosts.has(parsed.hostname)) {
    throw new Error('MONGO_TEST_URI must target the local toolshare_test database; refusing other targets.');
  }
}

if (mongoTestUri) assertIsolatedTestUri(mongoTestUri);

test('deactivation retains the MongoDB user and linked reservation', {
  skip: mongoTestUri ? false : 'Set MONGO_TEST_URI to a local toolshare_test MongoDB database.',
}, async (t) => {
  try {
    await mongoose.connect(mongoTestUri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }

  let userId;
  let reservationId;
  t.after(async () => {
    try {
      if (reservationId) await Reservation.deleteOne({ _id: reservationId });
      if (userId) await User.deleteOne({ _id: userId });
    } finally {
      await mongoose.disconnect();
    }
  });

  const user = await User.create({
    nom: 'Integration',
    prenom: 'Test',
    email: `toolshare-deactivation-${randomUUID()}@example.test`,
    password: await hashPassword(randomUUID()),
    role: 'Utilisateur',
    isActive: true,
  });
  userId = user._id;

  const originalReservation = await Reservation.create({
    userId: user._id,
    materielId: new mongoose.Types.ObjectId(),
    magasinId: new mongoose.Types.ObjectId(),
    dateDebut: new Date('2030-01-01T10:00:00.000Z'),
    dureeHeures: 2,
    dateFin: new Date('2030-01-01T12:00:00.000Z'),
    statut: 'TERMINEE',
  });
  reservationId = originalReservation._id;

  const result = await userService.deactivateUser(
    { id: new mongoose.Types.ObjectId().toString(), role: 'Admin' },
    user._id.toString()
  );

  assert.equal(result.isActive, false);

  const persistedUser = await User.findById(user._id);
  assert.ok(persistedUser, 'deactivated user document must remain in MongoDB');
  assert.equal(persistedUser.isActive, false);

  const persistedReservation = await Reservation.findById(originalReservation._id);
  assert.ok(persistedReservation, 'reservation document must remain in MongoDB');
  assert.equal(persistedReservation.userId.toString(), user._id.toString());
});
