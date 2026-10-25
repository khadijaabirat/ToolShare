'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_PATTERN.test(email);
}

module.exports = { EMAIL_PATTERN, isValidEmail, normalizeEmail };
