'use strict';

const mongoose = require('mongoose');
const { verifyPassword } = require('../utils/password');
const { EMAIL_PATTERN } = require('../utils/email');

const UserSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
  },
  prenom: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: EMAIL_PATTERN,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['Admin', 'Gestionnaire', 'Utilisateur'],
    default: 'Utilisateur',
    required: true,
  },
  magasinId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Magasin',
    required: function magasinRequired() {
      return this.role === 'Gestionnaire';
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  if (typeof this.password !== 'string') return Promise.resolve(false);
  return verifyPassword(candidate, this.password);
};

UserSchema.methods.toJSON = function toJSON() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
