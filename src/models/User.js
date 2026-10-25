'use strict';

const mongoose = require('mongoose');
const { hashPassword, verifyPassword } = require('../utils/password');
const { EMAIL_PATTERN } = require('../utils/email');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    match: EMAIL_PATTERN,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    required: true,
    trim: true,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
});

userSchema.pre('save', async function hashModifiedPassword() {
  if (this.isModified('password')) {
    this.password = await hashPassword(this.password);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (typeof this.password !== 'string') {
    return Promise.resolve(false);
  }

  return verifyPassword(candidate, this.password);
};

function removePassword(_document, serialized) {
  delete serialized.password;
  return serialized;
}

userSchema.set('toJSON', { transform: removePassword });
userSchema.set('toObject', { transform: removePassword });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
