'use strict';

/**
 * TOOL-88 / TOOL-89 — User account management service.
 *
 * Business rules:
 *   - No public registration; callers must already be authenticated.
 *   - Admin can create Admin, Gestionnaire, and Utilisateur accounts.
 *   - Gestionnaire can create Utilisateur accounts only (role-escalation prevention).
 *   - Gestionnaire accounts require a valid magasinId.
 *   - createdBy is always set to the caller's id; never trusted from the request body.
 *   - isActive is always initialised to true; cannot be set at creation time.
 *   - Deactivation only — documents are never deleted (reservation refs must stay valid).
 *   - The last active Admin cannot be deactivated.
 *   - Gestionnaire cannot deactivate Admin or other Gestionnaire accounts.
 */

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');

const VALID_ROLES = new Set(['Admin', 'Gestionnaire', 'Utilisateur']);

// Roles a given caller role is permitted to create.
const CREATABLE_BY = {
    Admin: new Set(['Admin', 'Gestionnaire', 'Utilisateur']),
    Gestionnaire: new Set(['Utilisateur']),
};

class UserService {

    /**
     * Create a new user account.
     *
     * @param {{ id: string, role: string }} callerUser - Authenticated caller from req.user.
     * @param {object} data - Request body fields.
     */
    async createAccount(callerUser, data) {
        const { nom, prenom, email, password, role, magasinId } = data;

        // Basic field presence — Mongoose schema also validates, but we want clean 400 messages.
        if (!nom || !prenom || !email || !password || !role) {
            const err = new Error('Les champs nom, prenom, email, password et role sont obligatoires.');
            err.statusCode = 400;
            throw err;
        }

        if (!VALID_ROLES.has(role)) {
            const err = new Error(`Rôle invalide. Valeurs acceptées: Admin, Gestionnaire, Utilisateur.`);
            err.statusCode = 400;
            throw err;
        }

        // Role-escalation prevention.
        const allowed = CREATABLE_BY[callerUser.role];
        if (!allowed || !allowed.has(role)) {
            const err = new Error('Accès refusé. Vous ne pouvez pas créer un compte avec ce rôle.');
            err.statusCode = 403;
            throw err;
        }

        // Gestionnaire accounts require a magasinId.
        if (role === 'Gestionnaire' && !magasinId) {
            const err = new Error('Un compte Gestionnaire doit être associé à un magasin (magasinId requis).');
            err.statusCode = 400;
            throw err;
        }

        // Unique-email guard — returns a clean 409 instead of a Mongoose duplicate-key crash.
        const existing = await userRepository.findByEmail(email.toLowerCase());
        if (existing) {
            const err = new Error('Un compte avec cet email existe déjà.');
            err.statusCode = 409;
            throw err;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userData = {
            nom,
            prenom,
            email,
            password: hashedPassword,
            role,
            createdBy: callerUser.id,
            isActive: true,
            // magasinId only when explicitly provided (avoids storing undefined).
            ...(magasinId ? { magasinId } : {}),
        };

        return userRepository.createUser(userData);
    }

    /**
     * List users visible to the caller.
     *   - Admin: all users.
     *   - Gestionnaire: only users assigned to the caller's magasin.
     *
     * @param {{ id: string, role: string, magasinId: string|null }} callerUser
     */
    async listUsers(callerUser) {
        if (callerUser.role === 'Admin') {
            return userRepository.findAllUsers();
        }
        // Gestionnaire — scope to their magasin.
        if (!callerUser.magasinId) {
            const err = new Error('Votre compte Gestionnaire n\'est pas associé à un magasin.');
            err.statusCode = 403;
            throw err;
        }
        return userRepository.findUsersByMagasin(callerUser.magasinId);
    }

    /**
     * Deactivate a user account (set isActive = false, never delete).
     *
     * @param {{ id: string, role: string }} callerUser
     * @param {string} targetId - The id of the user to deactivate.
     */
    async deactivateUser(callerUser, targetId) {
        const target = await userRepository.findUserById(targetId);
        if (!target) {
            const err = new Error('Utilisateur introuvable.');
            err.statusCode = 404;
            throw err;
        }

        if (!target.isActive) {
            const err = new Error('Ce compte est déjà désactivé.');
            err.statusCode = 400;
            throw err;
        }

        // Gestionnaire cannot deactivate Admin or Gestionnaire accounts.
        if (callerUser.role === 'Gestionnaire' &&
            (target.role === 'Admin' || target.role === 'Gestionnaire')) {
            const err = new Error('Accès refusé. Un Gestionnaire ne peut pas désactiver un compte Admin ou Gestionnaire.');
            err.statusCode = 403;
            throw err;
        }

        try {
            const deactivated = await userRepository.deactivateUser(targetId);
            if (!deactivated) {
                const err = new Error('Le compte a changé pendant la demande. Réessayez.');
                err.statusCode = 409;
                throw err;
            }
            return deactivated;
        } catch (error) {
            if (error && error.code === 'LAST_ACTIVE_ADMIN') {
                const conflict = new Error('Impossible de désactiver le dernier compte Admin actif.');
                conflict.statusCode = 409;
                throw conflict;
            }
            if (error && error.code === 'ADMIN_DEACTIVATION_IN_PROGRESS') {
                const conflict = new Error('Une désactivation Admin est déjà en cours. Réessayez.');
                conflict.statusCode = 409;
                throw conflict;
            }
            throw error;
        }
    }
}

module.exports = new UserService();
