'use strict';

const UserRepository = require('../repositories/userRepository');
const { isValidEmail, normalizeEmail } = require('../utils/email');

const ALLOWED_UPDATE_FIELDS = new Set(['email', 'currentPassword', 'newPassword']);

class ProfileError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ProfileError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function invalidRequest() {
  return new ProfileError(400, 'INVALID_REQUEST', 'A valid profile update is required.');
}

function unauthenticated() {
  return new ProfileError(401, 'UNAUTHENTICATED', 'Authentication is required.');
}

function safeUser(user) {
  return {
    id: String(user._id ?? user.id),
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role,
    magasinId: user.magasinId ? String(user.magasinId) : null,
  };
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function validateUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidRequest();
  }

  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !ALLOWED_UPDATE_FIELDS.has(key))) {
    throw invalidRequest();
  }

  const updates = {};
  if (hasOwn(input, 'email')) {
    updates.email = normalizeEmail(input.email);
    if (!isValidEmail(updates.email)) {
      throw invalidRequest();
    }
  }

  const hasCurrentPassword = hasOwn(input, 'currentPassword');
  const hasNewPassword = hasOwn(input, 'newPassword');
  if (hasCurrentPassword !== hasNewPassword) {
    throw invalidRequest();
  }

  if (hasCurrentPassword) {
    if (
      typeof input.currentPassword !== 'string' || input.currentPassword.length === 0 ||
      typeof input.newPassword !== 'string' || input.newPassword.length === 0
    ) {
      throw invalidRequest();
    }

    updates.currentPassword = input.currentPassword;
    updates.newPassword = input.newPassword;
  }

  if (!hasOwn(updates, 'email') && !hasCurrentPassword) {
    throw invalidRequest();
  }

  return updates;
}

async function getProfile(user) {
  if (!user || !user.id) {
    throw unauthenticated();
  }

  return safeUser(user);
}

async function updateProfile(userId, input) {
  const updates = validateUpdate(input);
  let credentialUser;

  if (hasOwn(updates, 'currentPassword')) {
    credentialUser = await UserRepository.findByIdForAuthentication(userId);
    if (!credentialUser || credentialUser.isActive !== true) {
      throw unauthenticated();
    }

    const passwordMatches = await credentialUser.comparePassword(updates.currentPassword);
    if (!passwordMatches) {
      throw new ProfileError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    }
  }

  let user = null;
  if (hasOwn(updates, 'email')) {
    try {
      user = await UserRepository.updateProfile(userId, { email: updates.email });
    } catch (error) {
      if (error && error.code === 'DUPLICATE_EMAIL') {
        throw new ProfileError(409, 'EMAIL_ALREADY_IN_USE', 'Email is already in use.');
      }
      throw error;
    }

    if (!user || user.isActive !== true) {
      throw unauthenticated();
    }
  }

  if (hasOwn(updates, 'newPassword')) {
    user = await UserRepository.updatePassword(userId, updates.newPassword);
    if (!user || user.isActive !== true) {
      throw unauthenticated();
    }
  }

  return safeUser(user);
}

module.exports = { ProfileError, getProfile, updateProfile };
