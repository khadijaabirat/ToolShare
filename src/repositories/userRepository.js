const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const User=require('../models/User');

const ADMIN_DEACTIVATION_LOCK_COLLECTION = 'toolshare_locks';
const ADMIN_DEACTIVATION_LOCK_ID = 'last-active-admin-deactivation';

function repositoryError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

async function withAdminDeactivationLock(operation) {
    const locks = mongoose.connection.collection(ADMIN_DEACTIVATION_LOCK_COLLECTION);
    const owner = randomUUID();

    try {
        await locks.insertOne({
            _id: ADMIN_DEACTIVATION_LOCK_ID,
            owner,
            acquiredAt: new Date(),
        });
    } catch (error) {
        if (error && error.code === 11000) {
            throw repositoryError(
                'ADMIN_DEACTIVATION_IN_PROGRESS',
                'Une désactivation Admin est déjà en cours. Réessayez.'
            );
        }
        throw error;
    }

    try {
        return await operation();
    } finally {
        // Do not use an expiring lease: it could expire while an operation is
        // still running and allow a second request to pass the last-Admin check.
        await locks.deleteOne({ _id: ADMIN_DEACTIVATION_LOCK_ID, owner });
    }
}

class userRepository{
    async createUser(userData){
        return await User.create(userData);
    }
    async findByEmail(email){
        return await User.findOne({email});
    }
    async deleteUserById(userId){
        return await User.findByIdAndDelete(userId);
    }
    async findUserById(id){
        return User.findById(id);
    }
    async assignMagasin(userId,magasinId){
        return User.findByIdAndUpdate(userId,{magasinId:magasinId},{
            new:true,
            runValidators:true
        });
    }

    // TOOL-89 — list support
    async findAllUsers(){
        return User.find({});
    }
    async findUsersByMagasin(magasinId){
        return User.find({ magasinId });
    }

    // TOOL-89 — deactivation
    async deactivateUser(id){
        const target = await User.findById(id).select('role isActive');
        if (!target || target.isActive !== true) return null;

        if (target.role !== 'Admin') {
            return User.findOneAndUpdate(
                { _id: id, role: { $ne: 'Admin' }, isActive: true },
                { $set: { isActive: false } },
                { new: true }
            );
        }

        return withAdminDeactivationLock(async () => {
            // Re-read under the lock so concurrent deactivations serialize
            // before counting active Admin accounts.
            const currentTarget = await User.findById(id).select('role isActive');
            if (!currentTarget || currentTarget.isActive !== true) return null;

            if (currentTarget.role !== 'Admin') {
                return User.findOneAndUpdate(
                    { _id: id, role: { $ne: 'Admin' }, isActive: true },
                    { $set: { isActive: false } },
                    { new: true }
                );
            }

            if (await this.countActiveAdmins() <= 1) {
                throw repositoryError(
                    'LAST_ACTIVE_ADMIN',
                    'Impossible de désactiver le dernier compte Admin actif.'
                );
            }

            return User.findOneAndUpdate(
                { _id: id, role: 'Admin', isActive: true },
                { $set: { isActive: false } },
                { new: true }
            );
        });
    }

    // TOOL-89 — last-admin guard
    async countActiveAdmins(){
        return User.countDocuments({ role: 'Admin', isActive: true });
    }
}
module.exports=new userRepository();
