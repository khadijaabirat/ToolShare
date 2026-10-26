'use strict';

const userService = require('../services/userService');

function safeUser(user) {
    if (!user || typeof user !== 'object') return user;

    const serialized = typeof user.toObject === 'function'
        ? user.toObject()
        : { ...user };

    delete serialized.password;
    delete serialized.passwordHash;
    return serialized;
}

function safeUsers(users) {
    return Array.isArray(users) ? users.map(safeUser) : users;
}

/**
 * TOOL-88: Create a new user account.
 * POST /api/users
 */
async function createUser(req, res, next) {
    try {
        const user = await userService.createAccount(req.user, req.body);
        return res.status(201).json({
            success: true,
            message: 'Compte créé avec succès.',
            data: safeUser(user),
        });
    } catch (error) {
        next(error);
    }
}

/**
 * TOOL-89: List users visible to the authenticated caller.
 * GET /api/users
 */
async function listUsers(req, res, next) {
    try {
        const users = await userService.listUsers(req.user);
        return res.status(200).json({
            success: true,
            data: safeUsers(users),
        });
    } catch (error) {
        next(error);
    }
}

/**
 * TOOL-89: Deactivate a user account.
 * PATCH /api/users/:id/deactivate
 */
async function deactivateUser(req, res, next) {
    try {
        const user = await userService.deactivateUser(req.user, req.params.id);
        return res.status(200).json({
            success: true,
            message: 'Compte désactivé avec succès.',
            data: safeUser(user),
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { createUser, listUsers, deactivateUser };
