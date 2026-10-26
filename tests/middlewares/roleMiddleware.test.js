'use strict';

/**
 * Unit tests for TOOL-87 — roleMiddleware
 *
 * Pure function tests; no Express app, no DB, no network.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const roleMiddleware = require('../../src/middlewares/roleMiddleware');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(role) {
    if (role === undefined) return {};
    return { user: { id: 'u1', email: 'a@b.com', role } };
}

function makeRes() {
    return {};
}

function run(middleware, req) {
    return new Promise((resolve) => {
        middleware(req, makeRes(), (arg) => resolve(arg));
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('roleMiddleware', () => {

    test('throws at definition time when an unknown role is supplied', () => {
        assert.throws(
            () => roleMiddleware('SUPERADMIN'),
            /rôle inconnu/i
        );
    });

    test('throws at definition time when one role in the list is a typo', () => {
        assert.throws(
            () => roleMiddleware('Admin', 'Gestionnair'), // missing 'e'
            /rôle inconnu/i
        );
    });

    test('returns 401 when req.user is missing', async () => {
        const mw = roleMiddleware('Admin');
        const err = await run(mw, {});
        assert.equal(err.statusCode, 401);
    });

    test('returns 401 when req.user.role is missing', async () => {
        const mw = roleMiddleware('Admin');
        const err = await run(mw, { user: { id: 'u1' } });
        assert.equal(err.statusCode, 401);
    });

    test('returns 403 when the user role is not in the allowed set', async () => {
        const mw = roleMiddleware('Admin');
        const err = await run(mw, makeReq('Utilisateur'));
        assert.equal(err.statusCode, 403);
    });

    test('returns 403 for Gestionnaire when only Admin is allowed', async () => {
        const mw = roleMiddleware('Admin');
        const err = await run(mw, makeReq('Gestionnaire'));
        assert.equal(err.statusCode, 403);
    });

    test('calls next() with no argument when role is in the allowed set', async () => {
        const mw = roleMiddleware('Admin', 'Gestionnaire');
        const result = await run(mw, makeReq('Admin'));
        assert.equal(result, undefined);
    });

    test('allows Gestionnaire when Gestionnaire is in the allowed set', async () => {
        const mw = roleMiddleware('Admin', 'Gestionnaire');
        const result = await run(mw, makeReq('Gestionnaire'));
        assert.equal(result, undefined);
    });

    test('allows Utilisateur when Utilisateur is in the allowed set', async () => {
        const mw = roleMiddleware('Utilisateur');
        const result = await run(mw, makeReq('Utilisateur'));
        assert.equal(result, undefined);
    });

    test('does not allow roles not in a single-role allowed set', async () => {
        const mw = roleMiddleware('Gestionnaire');
        const err = await run(mw, makeReq('Admin'));
        assert.equal(err.statusCode, 403);
    });

    test('each call to roleMiddleware returns a new independent middleware', async () => {
        const mwAdmin = roleMiddleware('Admin');
        const mwGest = roleMiddleware('Gestionnaire');
        const errAdminAsGest = await run(mwGest, makeReq('Admin'));
        const okGest = await run(mwGest, makeReq('Gestionnaire'));
        assert.equal(errAdminAsGest.statusCode, 403);
        assert.equal(okGest, undefined);
        // mwAdmin should still work independently
        const okAdmin = await run(mwAdmin, makeReq('Admin'));
        assert.equal(okAdmin, undefined);
    });
});
