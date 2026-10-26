'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const User = require('../models/User');
const { normalizeEmail } = require('../utils/email');
const { hashPassword } = require('../utils/password');

const ADMIN_DEACTIVATION_LOCK_COLLECTION = 'toolshare_locks';
const ADMIN_DEACTIVATION_LOCK_ID = 'last-active-admin-deactivation';

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function duplicateEmailError() {
  const error = new Error('Un compte avec cet email existe déjà.');
  error.code = 'DUPLICATE_EMAIL';
  return error;
}

function isDuplicateEmailError(error) {
  return error && error.code === 11000 && (
    (error.keyPattern && hasOwn(error.keyPattern, 'email')) ||
    (error.keyValue && hasOwn(error.keyValue, 'email'))
  );
}

function repositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function withAdminDeactivationLock(operation) {
  const locks = mongoose.connection.collection(ADMIN_DEACTIVATION_LOCK_COLLECTION);
  const owner = randomUUID();

  try {
    await locks.insertOne({
      _id: ADMIN_DEACTIVATION_LOCK_ID,
      owner,
      acquiredAt: new Date(),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      throw repositoryError(
        'ADMIN_DEACTIVATION_IN_PROGRESS',
        'Une désactivation Admin est déjà en cours. Réessayez.'
      );
    }
    throw error;
  }

  try {
    return await operation();
  } finally {
    // Keep the lock fail-closed; an expiring lease could permit overlapping checks.
    await locks.deleteOne({ _id: ADMIN_DEACTIVATION_LOCK_ID, owner });
  }
}

class UserRepository {
  createUser(userData) {
    return User.create(userData);
  }

  findByEmail(email) {
    if (typeof email !== 'string' || email.trim() === '') return Promise.resolve(null);
    return User.findOne({ email: normalizeEmail(email) }).select('-password');
  }

  findByEmailForAuthentication(email) {
    if (typeof email !== 'string' || email.trim() === '') return Promise.resolve(null);
    return User.findOne({ email: normalizeEmail(email) }).select('+password');
  }

  deleteUserById(userId) {
    return User.findByIdAndDelete(userId);
  }

  findUserById(id) {
    return User.findById(id).select('-password');
  }

  findById(id) {
    return this.findUserById(id);
  }

  findByIdForAuthentication(id) {
    return User.findById(id).select('+password');
  }

  async updateProfile(id, profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new TypeError('Profile update must be an object');
    }

    const permittedUpdates = {};
    if (hasOwn(profile, 'email')) permittedUpdates.email = normalizeEmail(profile.email);
    if (Object.keys(permittedUpdates).length === 0) return this.findById(id);

    const existingUser = await User.findOne({
      email: permittedUpdates.email,
      _id: { $ne: id },
    }).select('_id');
    if (existingUser) throw duplicateEmailError();

    try {
      return await User.findByIdAndUpdate(
        id,
        { $set: permittedUpdates },
        { new: true, runValidators: true }
      ).select('-password');
    } catch (error) {
      if (isDuplicateEmailError(error)) throw duplicateEmailError();
      throw error;
    }
  }

  async updatePassword(id, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length === 0) {
      throw new TypeError('New password must be a non-empty string');
    }

    const hashedPassword = await hashPassword(newPassword);
    return User.findByIdAndUpdate(
      id,
      { $set: { password: hashedPassword } },
      { new: true, runValidators: true }
    ).select('-password');
  }

  assignMagasin(userId, magasinId) {
    return User.findByIdAndUpdate(userId, { magasinId }, {
      new: true,
      runValidators: true,
    });
  }

  findAllUsers() {
    return User.find({}).select('-password');
  }

  findUsersByMagasin(magasinId) {
    return User.find({ magasinId }).select('-password');
  }

  async deactivateUser(id) {
    const target = await User.findById(id).select('role isActive');
    if (!target || target.isActive !== true) return null;

    if (target.role !== 'Admin') {
      return User.findOneAndUpdate(
        { _id: id, role: { $ne: 'Admin' }, isActive: true },
        { $set: { isActive: false } },
        { new: true }
      );
    }

    return withAdminDeactivationLock(async () => {
      const currentTarget = await User.findById(id).select('role isActive');
      if (!currentTarget || currentTarget.isActive !== true) return null;

      if (currentTarget.role !== 'Admin') {
        return User.findOneAndUpdate(
          { _id: id, role: { $ne: 'Admin' }, isActive: true },
          { $set: { isActive: false } },
          { new: true }
        );
      }

      if (await this.countActiveAdmins() <= 1) {
        throw repositoryError(
          'LAST_ACTIVE_ADMIN',
          'Impossible de désactiver le dernier compte Admin actif.'
        );
      }

      return User.findOneAndUpdate(
        { _id: id, role: 'Admin', isActive: true },
        { $set: { isActive: false } },
        { new: true }
      );
    });
  }

  countActiveAdmins() {
    return User.countDocuments({ role: 'Admin', isActive: true });
  }
}

module.exports = new UserRepository();
