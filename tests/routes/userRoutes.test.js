'use strict';

/**
 * Integration tests for TOOL-88 / TOOL-89 — user account management routes.
 *
 * Strategy:
 *   - Start an Express app on a random port (port 0) for each suite.
 *   - Replace the singleton instances in the require cache with lightweight
 *     stub objects before each test, then restore them afterwards.
 *   - No real MongoDB connection required.
 *   - Uses node:test + node:assert/strict + the built-in fetch (Node ≥ 18).
 */

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { verifyPassword } = require('../../src/utils/password');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = randomBytes(32).toString('hex');   // 64-char hex string, > 32 chars

/** Issue a JWT with the given payload. */
function sign(payload) {
    return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

/** Build a Bearer Authorization header value. */
function bearer(token) {
    return `Bearer ${token}`;
}

/** Fake ObjectId-like string (24 hex chars). */
function fakeId() {
    return randomBytes(12).toString('hex');
}

const adminId     = fakeId();
const gestId      = fakeId();
const utilisId    = fakeId();
const magasinId   = fakeId();
const newUserId   = fakeId();

// Pre-built user stubs that authMiddleware will "find" in the DB.
const USERS_DB = {
    [adminId]:  { _id: adminId, email: 'admin@test.com', role: 'Admin',       isActive: true, magasinId: null },
    [gestId]:   { _id: gestId,  email: 'gest@test.com',  role: 'Gestionnaire', isActive: true, magasinId },
    [utilisId]: { _id: utilisId, email: 'util@test.com', role: 'Utilisateur',  isActive: true, magasinId: null },
};

// ---------------------------------------------------------------------------
// App factory — build an Express app with mocked dependencies.
// ---------------------------------------------------------------------------

/**
 * Build a fresh Express app and inject mock implementations for
 * userRepository and userService so no real DB is needed.
 *
 * @param {object} opts
 * @param {object} [opts.repoOverrides]    - Methods to override on userRepository singleton.
 * @param {object} [opts.serviceOverrides] - Methods to override on userService singleton.
 */
function buildApp(opts = {}) {
    // Clear cached modules so we get fresh instances.
    // We must do this before requiring anything from src/.
    const modulesToClear = [
        '../../src/app',
        '../../src/routes/index',
        '../../src/routes/userRoutes',
        '../../src/controllers/userController',
        '../../src/services/userService',
        '../../src/repositories/userRepository',
        '../../src/repositories/magasinRepository',
        '../../src/middlewares/authMiddleware',
        '../../src/middlewares/roleMiddleware',
    ];
    for (const id of modulesToClear) {
        try {
            delete require.cache[require.resolve(id)];
        } catch (_) { /* not cached */ }
    }

    // Set JWT_SECRET before authMiddleware is loaded.
    process.env.JWT_SECRET = JWT_SECRET;

    // --- Mock userRepository ---
    const repoMod = require('../../src/repositories/userRepository');
    const repoOverrides = opts.repoOverrides || {};
    // Default: findUserById looks up USERS_DB (used by authMiddleware).
    repoMod.findUserById = repoOverrides.findUserById ||
        function (id) { return Promise.resolve(USERS_DB[id] || null); };
    repoMod.findByEmail     = repoOverrides.findByEmail     || (() => Promise.resolve(null));
    repoMod.createUser      = repoOverrides.createUser      || (() => Promise.resolve({ _id: newUserId }));
    repoMod.findAllUsers    = repoOverrides.findAllUsers    || (() => Promise.resolve([]));
    repoMod.findUsersByMagasin = repoOverrides.findUsersByMagasin || (() => Promise.resolve([]));
    repoMod.deactivateUser  = repoOverrides.deactivateUser  || (() => Promise.resolve(null));
    repoMod.countActiveAdmins = repoOverrides.countActiveAdmins || (() => Promise.resolve(2));

    // Patch the require cache so that userService picks up our mock repo.
    const repoPath = require.resolve('../../src/repositories/userRepository');
    require.cache[repoPath].exports = repoMod;

    const magasinRepo = require('../../src/repositories/magasinRepository');
    const magasinOverrides = opts.magasinOverrides || {};
    magasinRepo.findActiveMagasinById = magasinOverrides.findActiveMagasinById ||
        ((id) => Promise.resolve({ _id: id, isActive: true }));

    // --- Load app ---
    const app = require('../../src/app');
    return app;
}

/**
 * Start an HTTP server on a random port and return { server, url }.
 */
function startServer(app) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
        server.on('error', reject);
    });
}

/** Make a JSON request using the built-in fetch (Node ≥ 18). */
async function req(url, method, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = bearer(token);
    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* empty body */ }
    return { status: res.status, json };
}

function assertApiError(result, status, messageFragment) {
    assert.equal(result.status, status);
    assert.deepEqual(Object.keys(result.json).sort(), ['message']);
    assert.equal(typeof result.json.message, 'string');
    assert.ok(result.json.message.includes(messageFragment),
        `expected error message to include "${messageFragment}", got "${result.json.message}"`);
}

// ---------------------------------------------------------------------------
// Suite — POST /api/users
// ---------------------------------------------------------------------------

describe('POST /api/users', () => {
    let server, url;

    before(async () => {
        const app = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),  // email always available
                createUser: (data) => Promise.resolve({
                    _id: newUserId,
                    ...data,
                    toJSON: undefined, // plain object — router will serialize it
                }),
            },
        });
        ({ server, url } = await startServer(app));
    });

    after(() => new Promise((res) => server.close(res)));

    test('Admin can create an Utilisateur', async () => {
        const token = sign({ sub: adminId });
        const { status, json } = await req(`${url}/api/users`, 'POST', {
            nom: 'Test', prenom: 'User', email: 'new@test.com',
            password: 'Secret123!', role: 'Utilisateur',
        }, token);
        assert.equal(status, 201);
        assert.equal(json.success, true);
    });

    test('Admin can create a Gestionnaire with magasinId', async () => {
        const token = sign({ sub: adminId });
        const { status, json } = await req(`${url}/api/users`, 'POST', {
            nom: 'Test', prenom: 'Gest', email: 'gest2@test.com',
            password: 'Secret123!', role: 'Gestionnaire', magasinId,
        }, token);
        assert.equal(status, 201);
        assert.equal(json.success, true);
    });

    test('Admin can create another Admin', async () => {
        const token = sign({ sub: adminId });
        const { status, json } = await req(`${url}/api/users`, 'POST', {
            nom: 'Admin', prenom: 'Deux', email: 'admin2@test.com',
            password: 'Secret123!', role: 'Admin',
        }, token);
        assert.equal(status, 201);
        assert.equal(json.success, true);
    });

    test('Gestionnaire creates an Utilisateur in their assigned magasin', async () => {
        let captured;
        const app2 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),
                createUser: (data) => {
                    captured = data;
                    return Promise.resolve({ _id: newUserId, ...data });
                },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: gestId });
        const { status, json } = await req(`${u2}/api/users`, 'POST', {
            nom: 'Util', prenom: 'One', email: 'util2@test.com',
            password: 'Secret123!', role: 'Utilisateur',
        }, token);
        await new Promise((r) => s2.close(r));
        assert.equal(status, 201);
        assert.equal(json.success, true);
        assert.equal(String(captured.magasinId), magasinId);
    });

    test('Gestionnaire cannot override their assigned magasin with a client-supplied ID', async () => {
        const otherMagasinId = fakeId();
        let captured;
        const app2 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),
                createUser: (data) => {
                    captured = data;
                    return Promise.resolve({ _id: newUserId, ...data });
                },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const { status, json } = await req(`${u2}/api/users`, 'POST', {
            nom: 'Util', prenom: 'Two', email: 'util3@test.com',
            password: 'Secret123!', role: 'Utilisateur', magasinId: otherMagasinId,
        }, sign({ sub: gestId }));
        await new Promise((r) => s2.close(r));
        assert.equal(status, 201);
        assert.equal(json.success, true);
        assert.equal(String(json.data.magasinId), magasinId);
        assert.equal(String(captured.magasinId), magasinId);
        assert.notEqual(String(captured.magasinId), otherMagasinId);
    });

    test('Gestionnaire without a valid active store assignment is denied', async () => {
        for (const [callerMagasinId, expectedMessage] of [
            [null, 'affectation magasin valide'],
            ['not-a-valid-id', 'affectation magasin valide'],
        ]) {
            let createCalls = 0;
            const app2 = buildApp({
                repoOverrides: {
                    findUserById: (id) => Promise.resolve(id === gestId
                        ? { ...USERS_DB[gestId], magasinId: callerMagasinId }
                        : USERS_DB[id] || null),
                    createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
                },
            });
            const { server: s2, url: u2 } = await startServer(app2);
            const result = await req(`${u2}/api/users`, 'POST', {
                nom: 'Util', prenom: 'Three', email: `util-${String(callerMagasinId)}@test.com`,
                password: 'Secret123!', role: 'Utilisateur',
            }, sign({ sub: gestId }));
            await new Promise((r) => s2.close(r));
            assertApiError(result, 403, expectedMessage);
            assert.equal(createCalls, 0);
        }

        let createCalls = 0;
        const inactiveStoreApp = buildApp({
            magasinOverrides: { findActiveMagasinById: () => Promise.resolve(null) },
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s3, url: u3 } = await startServer(inactiveStoreApp);
        const inactiveResult = await req(`${u3}/api/users`, 'POST', {
            nom: 'Util', prenom: 'Inactive store', email: 'util-inactive-store@test.com',
            password: 'Secret123!', role: 'Utilisateur',
        }, sign({ sub: gestId }));
        await new Promise((r) => s3.close(r));
        assertApiError(inactiveResult, 403, 'introuvable');
        assert.equal(createCalls, 0);
    });

    test('Admin can create an account for another valid active magasin', async () => {
        const otherMagasinId = fakeId();
        let captured;
        const app2 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),
                createUser: (data) => {
                    captured = data;
                    return Promise.resolve({ _id: newUserId, ...data });
                },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const { status } = await req(`${u2}/api/users`, 'POST', {
            nom: 'Util', prenom: 'Four', email: 'admin-created@test.com',
            password: 'Secret123!', role: 'Utilisateur', magasinId: otherMagasinId,
        }, sign({ sub: adminId }));
        await new Promise((r) => s2.close(r));
        assert.equal(status, 201);
        assert.equal(String(captured.magasinId), otherMagasinId);
    });

    test('Admin rejects a magasin with no active matching record', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            magasinOverrides: { findActiveMagasinById: () => Promise.resolve(null) },
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'Util', prenom: 'Five', email: 'admin-invalid-store@test.com',
            password: 'Secret123!', role: 'Utilisateur', magasinId,
        }, sign({ sub: adminId }));
        await new Promise((r) => s2.close(r));
        assertApiError(result, 400, 'magasin fourni est introuvable');
        assert.equal(createCalls, 0);

        const Magasin = require('../../src/models/Magasin');
        const repositoryPath = require.resolve('../../src/repositories/magasinRepository');
        delete require.cache[repositoryPath];
        const actualMagasinRepository = require(repositoryPath);
        const originalFindOne = Magasin.findOne;
        let capturedFilter;
        Magasin.findOne = (filter) => {
            capturedFilter = filter;
            return Promise.resolve(null);
        };
        try {
            await actualMagasinRepository.findActiveMagasinById(magasinId);
        } finally {
            Magasin.findOne = originalFindOne;
            delete require.cache[repositoryPath];
        }
        assert.deepEqual(capturedFilter, { _id: magasinId, isActive: true });

        let malformedStoreCreateCalls = 0;
        const app3 = buildApp({
            repoOverrides: {
                createUser: () => { malformedStoreCreateCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s3, url: u3 } = await startServer(app3);
        const malformedResult = await req(`${u3}/api/users`, 'POST', {
            nom: 'Util', prenom: 'Six', email: 'admin-malformed-store@test.com',
            password: 'Secret123!', role: 'Utilisateur', magasinId: 'bad-id',
        }, sign({ sub: adminId }));
        await new Promise((r) => s3.close(r));
        assertApiError(malformedResult, 400, 'magasinId invalide');
        assert.equal(malformedStoreCreateCalls, 0);
    });

    test('Gestionnaire cannot create a Gestionnaire (403)', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: gestId });
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'Gest', prenom: 'Two', email: 'gest3@test.com',
            password: 'Secret123!', role: 'Gestionnaire', magasinId,
        }, token);
        await new Promise((r) => s2.close(r));
        assertApiError(result, 403, 'Vous ne pouvez pas');
        assert.equal(createCalls, 0);
    });

    test('Gestionnaire cannot create an Admin (403)', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: gestId });
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'Admin', prenom: 'X', email: 'admin3@test.com',
            password: 'Secret123!', role: 'Admin',
        }, token);
        await new Promise((r) => s2.close(r));
        assertApiError(result, 403, 'Vous ne pouvez pas');
        assert.equal(createCalls, 0);
    });

    test('Utilisateur is denied with an authorization error before user creation', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: utilisId });
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'c@d.com',
            password: 'pass', role: 'Utilisateur',
        }, token);
        await new Promise((r) => s2.close(r));
        assertApiError(result, 403, 'permissions');
        assert.equal(createCalls, 0);
    });

    test('Missing Authorization header returns an authentication error before user creation', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'c@d.com',
            password: 'pass', role: 'Utilisateur',
        });
        await new Promise((r) => s2.close(r));
        assertApiError(result, 401, 'Authentification requise');
        assert.equal(createCalls, 0);
    });

    test('Invalid JWT token returns an authentication error before user creation', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'c@d.com',
            password: 'pass', role: 'Utilisateur',
        }, 'not.a.valid.token');
        await new Promise((r) => s2.close(r));
        assertApiError(result, 401, 'Authentification requise');
        assert.equal(createCalls, 0);
    });

    test('A correctly signed token without exp returns 401', async () => {
        const token = jwt.sign({ sub: adminId }, JWT_SECRET, { algorithm: 'HS256' });
        const { status } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 401);
    });

    test('A correctly signed token with a malformed subject returns 401', async () => {
        const token = sign({ sub: 'not-an-object-id' });
        const { status } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 401);
    });

    test('An expired token returns 401', async () => {
        const token = jwt.sign(
            { sub: adminId, exp: Math.floor(Date.now() / 1000) - 60 },
            JWT_SECRET,
            { algorithm: 'HS256' }
        );
        const { status } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 401);
    });

    test('A token with an invalid signature returns 401', async () => {
        const token = jwt.sign(
            { sub: adminId },
            randomBytes(32).toString('hex'),
            { algorithm: 'HS256', expiresIn: '1h' }
        );
        const { status } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 401);
    });

    test('Missing required fields returns a validation error without creating a user', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: adminId });
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'OnlyNom',
        }, token);
        await new Promise((r) => s2.close(r));
        assertApiError(result, 400, 'champs nom, prenom, email, password et role sont obligatoires');
        assert.equal(createCalls, 0);
    });

    test('Malformed account bodies and email values return 400', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: adminId });
        const cases = [
            [null, 'Corps JSON invalide.'],
            [[], 'informations du compte sont invalides'],
            [{ nom: 'A', prenom: 'B', email: 'invalid', password: 'pw', role: 'Utilisateur' }, 'informations du compte sont invalides'],
        ];
        const results = [];
        for (const [body] of cases) {
            results.push(await req(`${u2}/api/users`, 'POST', body, token));
        }
        await new Promise((r) => s2.close(r));
        results.forEach((result, index) => assertApiError(result, 400, cases[index][1]));
        assert.equal(createCalls, 0);
    });

    test('Unknown role returns a validation error without creating a user', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'unknown-role@test.com',
            password: 'Secret123!', role: 'SUPERADMIN',
        }, sign({ sub: adminId }));
        await new Promise((r) => s2.close(r));
        assertApiError(result, 400, 'Rôle invalide');
        assert.equal(createCalls, 0);
    });

    test('Repository receives a bcrypt hash and the response exposes no password value', async () => {
        const plainPassword = 'Secret123!';
        let captured;
        const app2 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),
                createUser: (data) => {
                    captured = data;
                    return Promise.resolve({ _id: newUserId, ...data });
                },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: adminId });
        const { status, json } = await req(`${u2}/api/users`, 'POST', {
            nom: 'Secure', prenom: 'User', email: 'secure@test.com',
            password: plainPassword, role: 'Utilisateur',
        }, token);
        await new Promise((r) => s2.close(r));

        assert.equal(status, 201);
        assert.equal(typeof captured.password, 'string');
        assert.notEqual(captured.password, plainPassword);
        assert.equal(await verifyPassword(plainPassword, captured.password), true);
        assert.equal(JSON.stringify(captured).includes(plainPassword), false);
        assert.equal(Object.hasOwn(json.data, 'password'), false);
        assert.equal(Object.hasOwn(json.data, 'passwordHash'), false);
        assert.equal(JSON.stringify(json).includes(plainPassword), false);
        assert.equal(JSON.stringify(json).includes(captured.password), false);
    });

    test('createdBy in body is ignored; service sets it from req.user', async () => {
        // We verify this indirectly: createUser receives createdBy = adminId, not the fake one.
        let captured;
        const app2 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve(null),
                createUser: (data) => {
                    captured = data;
                    return Promise.resolve({ _id: newUserId, ...data });
                },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: adminId });
        await req(`${u2}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'e@f.com',
            password: 'pass', role: 'Utilisateur',
            createdBy: 'FAKE_ID_FROM_BODY',  // must be ignored
            isActive: false,                  // must be ignored
        }, token);
        await new Promise((r) => s2.close(r));
        assert.equal(String(captured.createdBy), adminId);
        assert.equal(captured.isActive, true);
    });

    test('Duplicate email returns a conflict without creating a user', async () => {
        let createCalls = 0;
        const app3 = buildApp({
            repoOverrides: {
                findByEmail: () => Promise.resolve({ _id: 'existing' }),  // email taken
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s3, url: u3 } = await startServer(app3);
        const token = sign({ sub: adminId });
        const result = await req(`${u3}/api/users`, 'POST', {
            nom: 'A', prenom: 'B', email: 'taken@test.com',
            password: 'pass', role: 'Utilisateur',
        }, token);
        await new Promise((r) => s3.close(r));
        assertApiError(result, 409, 'email existe');
        assert.equal(createCalls, 0);
    });

    test('Gestionnaire creating Utilisateur uses the authenticated magasin without requiring body magasinId', async () => {
        const token = sign({ sub: gestId });
        const { status } = await req(`${url}/api/users`, 'POST', {
            nom: 'U', prenom: 'U', email: 'util99@test.com',
            password: 'pass', role: 'Utilisateur',
        }, token);
        assert.equal(status, 201);
    });

    test('Creating Gestionnaire without magasinId returns a validation error without creating a user', async () => {
        let createCalls = 0;
        const app2 = buildApp({
            repoOverrides: {
                createUser: () => { createCalls += 1; return Promise.resolve({ _id: newUserId }); },
            },
        });
        const { server: s2, url: u2 } = await startServer(app2);
        const token = sign({ sub: adminId });
        const result = await req(`${u2}/api/users`, 'POST', {
            nom: 'G', prenom: 'G', email: 'g99@test.com',
            password: 'pass', role: 'Gestionnaire',
            // magasinId intentionally omitted
        }, token);
        await new Promise((r) => s2.close(r));
        assertApiError(result, 400, 'magasinId requis');
        assert.equal(createCalls, 0);
    });
});

// ---------------------------------------------------------------------------
// Suite — GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
    let server, url;

    const allUsers  = [{ _id: adminId }, { _id: gestId }];
    const magUsers  = [{ _id: utilisId }];

    before(async () => {
        const app = buildApp({
            repoOverrides: {
                findAllUsers:       () => Promise.resolve(allUsers),
                findUsersByMagasin: () => Promise.resolve(magUsers),
            },
        });
        ({ server, url } = await startServer(app));
    });

    after(() => new Promise((r) => server.close(r)));

    test('Admin sees all users', async () => {
        const token = sign({ sub: adminId });
        const { status, json } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 200);
        assert.equal(json.success, true);
        assert.deepEqual(json.data, allUsers);
    });

    test('Gestionnaire sees only magasin-scoped users', async () => {
        const token = sign({ sub: gestId });
        const { status, json } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 200);
        assert.equal(json.success, true);
        assert.deepEqual(json.data, magUsers);
    });

    test('Utilisateur is denied (403)', async () => {
        const token = sign({ sub: utilisId });
        const { status } = await req(`${url}/api/users`, 'GET', undefined, token);
        assert.equal(status, 403);
    });

    test('No token returns 401', async () => {
        const { status } = await req(`${url}/api/users`, 'GET');
        assert.equal(status, 401);
    });
});

// ---------------------------------------------------------------------------
// Suite — PATCH /api/users/:id/deactivate
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id/deactivate', () => {
    let server, url;

    // A second admin in the DB (so deactivating first admin still leaves 1 active).
    const admin2Id = fakeId();
    const USERS_EXT = {
        ...USERS_DB,
        [admin2Id]: { _id: admin2Id, email: 'admin2@test.com', role: 'Admin', isActive: true, magasinId: null },
    };

    before(async () => {
        const app = buildApp({
            repoOverrides: {
                findUserById: (id) => Promise.resolve(USERS_EXT[id] || null),
                countActiveAdmins: () => Promise.resolve(2),
                deactivateUser: (id) => Promise.resolve({ _id: id, isActive: false }),
            },
        });
        ({ server, url } = await startServer(app));
    });

    after(() => new Promise((r) => server.close(r)));

    test('Admin can deactivate an Utilisateur', async () => {
        const token = sign({ sub: adminId });
        const { status, json } = await req(
            `${url}/api/users/${utilisId}/deactivate`, 'PATCH', undefined, token
        );
        assert.equal(status, 200);
        assert.equal(json.success, true);
        assert.equal(json.data.isActive, false);
    });

    test('Gestionnaire cannot deactivate an Admin (403)', async () => {
        const token = sign({ sub: gestId });
        const { status } = await req(
            `${url}/api/users/${adminId}/deactivate`, 'PATCH', undefined, token
        );
        assert.equal(status, 403);
    });

    test('Gestionnaire cannot deactivate another Gestionnaire (403)', async () => {
        const token = sign({ sub: adminId });
        // Build an app where the target is a Gestionnaire.
        const app2 = buildApp({
            repoOverrides: {
                findUserById: (id) => {
                    if (id === gestId) return Promise.resolve({ _id: gestId, role: 'Gestionnaire', isActive: true });
                    return Promise.resolve(USERS_DB[id] || null);
                },
                countActiveAdmins: () => Promise.resolve(2),
                deactivateUser: (id) => Promise.resolve({ _id: id, isActive: false }),
            },
        });
        // Use gestId as *caller* this time.
        const app3 = buildApp({
            repoOverrides: {
                findUserById: (id) => {
                    // gestId is the caller (authenticated) AND the target
                    return Promise.resolve(USERS_EXT[id] || { _id: id, role: 'Gestionnaire', isActive: true });
                },
                countActiveAdmins: () => Promise.resolve(2),
                deactivateUser: (id) => Promise.resolve({ _id: id, isActive: false }),
            },
        });
        const { server: s3, url: u3 } = await startServer(app3);
        const gestToken = sign({ sub: gestId });
        const { status } = await req(`${u3}/api/users/${gestId}/deactivate`, 'PATCH', undefined, gestToken);
        await new Promise((r) => s3.close(r));
        assert.equal(status, 403);
    });

    test('Cannot deactivate the last active Admin (409)', async () => {
        const app4 = buildApp({
            repoOverrides: {
                findUserById: (id) => Promise.resolve(USERS_EXT[id] || null),
                deactivateUser: () => Promise.reject(Object.assign(
                    new Error('last active Admin'),
                    { code: 'LAST_ACTIVE_ADMIN' }
                )),
            },
        });
        const { server: s4, url: u4 } = await startServer(app4);
        const token = sign({ sub: adminId });
        const { status } = await req(
            `${u4}/api/users/${adminId}/deactivate`, 'PATCH', undefined, token
        );
        await new Promise((r) => s4.close(r));
        assert.equal(status, 409);
    });

    test('Deactivating a non-existent user returns 404', async () => {
        const token = sign({ sub: adminId });
        const { status } = await req(
            `${url}/api/users/${fakeId()}/deactivate`, 'PATCH', undefined, token
        );
        assert.equal(status, 404);
    });

    test('Utilisateur cannot access deactivate endpoint (403)', async () => {
        const token = sign({ sub: utilisId });
        const { status } = await req(
            `${url}/api/users/${utilisId}/deactivate`, 'PATCH', undefined, token
        );
        assert.equal(status, 403);
    });

    test('No token returns 401', async () => {
        const { status } = await req(
            `${url}/api/users/${utilisId}/deactivate`, 'PATCH'
        );
        assert.equal(status, 401);
    });

    test('Deactivated user cannot authenticate (authMiddleware rejects isActive=false)', async () => {
        // Build an app where the authenticated user is already deactivated.
        const deactivatedId = fakeId();
        const app5 = buildApp({
            repoOverrides: {
                findUserById: (id) => {
                    if (id === deactivatedId) {
                        return Promise.resolve({ _id: deactivatedId, role: 'Admin', isActive: false });
                    }
                    return Promise.resolve(null);
                },
            },
        });
        const { server: s5, url: u5 } = await startServer(app5);
        const token = sign({ sub: deactivatedId });
        const { status } = await req(`${u5}/api/users`, 'GET', undefined, token);
        await new Promise((r) => s5.close(r));
        assert.equal(status, 401);
    });
});
