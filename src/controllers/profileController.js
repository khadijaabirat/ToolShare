'use strict';

const ProfileService = require('../services/profileService');

function sendError(res, error) {
  if (error instanceof ProfileService.ProfileError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  return res.status(500).json({
    message: 'Erreur serveur',
  });
}

async function getProfile(req, res) {
  try {
    const user = await ProfileService.getProfile(req.user);
    return res.status(200).json({ user });
  } catch (error) {
    return sendError(res, error);
  }
}

async function updateProfile(req, res) {
  try {
    const user = await ProfileService.updateProfile(req.user.id, req.body);
    return res.status(200).json({ user });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = { getProfile, updateProfile };
