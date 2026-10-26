'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const userRepository = require('../../src/repositories/userRepository');

const ADMIN_ID = '507f1f77bcf86cd799439011';

function queryFor(document) {
    return { select: async () => document };
}

function installMocks(t, { activeAdminCount, findOneAndUpdate }) {
    const originalCollection = mongoose.connection.collection;
    const originalFindById = User.findById;
    const originalCountDocuments = User.countDocuments;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    let lockOwner = null;

    mongoose.connection.collection = () => ({
        async insertOne(document) {
            if (lockOwner !== null) {
                const error = new Error('duplicate lock id');
                error.code = 11000;
                throw error;
            }
            lockOwner = document.owner;
        },
        async deleteOne(filter) {
            if (lockOwner === filter.owner) lockOwner = null;
        },
    });
    User.findById = () => queryFor({ role: 'Admin', isActive: true });
    User.countDocuments = async () => activeAdminCount();
    User.findOneAndUpdate = (...args) => findOneAndUpdate(...args);

    t.after(() => {
        mongoose.connection.collection = originalCollection;
        User.findById = originalFindById;
        User.countDocuments = originalCountDocuments;
        User.findOneAndUpdate = originalFindOneAndUpdate;
    });

    return () => lockOwner;
}

test('last active Admin is not deactivated and the database lock is released', async (t) => {
    let updateCalls = 0;
    const getLockOwner = installMocks(t, {
        activeAdminCount: async () => 1,
        findOneAndUpdate: async () => {
            updateCalls += 1;
            return { _id: ADMIN_ID, isActive: false };
        },
    });

    await assert.rejects(
        userRepository.deactivateUser(ADMIN_ID),
        (error) => error.code === 'LAST_ACTIVE_ADMIN'
    );
    assert.equal(updateCalls, 0);
    assert.equal(getLockOwner(), null);
});

test('concurrent Admin deactivations cannot both pass the active-Admin count', async (t) => {
    let activeLockOwner = null;
    let countCalls = 0;
    let updateCalls = 0;
    let releaseCount;
    let signalCountStarted;
    const countStarted = new Promise((resolve) => { signalCountStarted = resolve; });
    const countGate = new Promise((resolve) => { releaseCount = resolve; });

    const originalCollection = mongoose.connection.collection;
    const originalFindById = User.findById;
    const originalCountDocuments = User.countDocuments;
    const originalFindOneAndUpdate = User.findOneAndUpdate;

    mongoose.connection.collection = () => ({
        async insertOne(document) {
            if (activeLockOwner !== null) {
                const error = new Error('duplicate lock id');
                error.code = 11000;
                throw error;
            }
            activeLockOwner = document.owner;
        },
        async deleteOne(filter) {
            if (activeLockOwner === filter.owner) activeLockOwner = null;
        },
    });
    User.findById = () => queryFor({ role: 'Admin', isActive: true });
    User.countDocuments = async () => {
        countCalls += 1;
        signalCountStarted();
        await countGate;
        return 2;
    };
    User.findOneAndUpdate = async () => {
        updateCalls += 1;
        return { _id: ADMIN_ID, isActive: false };
    };

    t.after(() => {
        mongoose.connection.collection = originalCollection;
        User.findById = originalFindById;
        User.countDocuments = originalCountDocuments;
        User.findOneAndUpdate = originalFindOneAndUpdate;
    });

    const firstDeactivation = userRepository.deactivateUser(ADMIN_ID);
    await countStarted;
    await assert.rejects(
        userRepository.deactivateUser('507f1f77bcf86cd799439012'),
        (error) => error.code === 'ADMIN_DEACTIVATION_IN_PROGRESS'
    );

    releaseCount();
    const result = await firstDeactivation;
    assert.equal(result.isActive, false);
    assert.equal(countCalls, 1);
    assert.equal(updateCalls, 1);
    assert.equal(activeLockOwner, null);
});
