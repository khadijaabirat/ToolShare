'use strict';

const AuthService = require('../services/authService');

async function login(req, res) {
  try {
    const response = await AuthService.login(req.body);
    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof AuthService.AuthError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({
      message: 'Erreur serveur',
    });
  }
}

module.exports = { login };
