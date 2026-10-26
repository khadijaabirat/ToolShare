const User = require('../models/User');
const { normalizeEmail } = require('../utils/email');
const { hashPassword } = require('../utils/password');

function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function duplicateEmailError() {
    const error = new Error('Un compte avec cet email existe déjà.');
    error.code = 'DUPLICATE_EMAIL';
    return error;
}

function isDuplicateEmailError(error) {
    return error && error.code === 11000 && (
        (error.keyPattern && hasOwn(error.keyPattern, 'email')) ||
        (error.keyValue && hasOwn(error.keyValue, 'email'))
    );
}

class userRepository{
    async createUser(userData){
        return await User.create(userData);
    }
    async findByEmail(email){
        if (typeof email !== 'string' || email.trim() === '') return null;
        return User.findOne({ email: normalizeEmail(email) }).select('-password');
    }
    findByEmailForAuthentication(email) {
        if (typeof email !== 'string' || email.trim() === '') return Promise.resolve(null);
        return User.findOne({ email: normalizeEmail(email) }).select('+password');
    }
    async deleteUserById(userId){
        return await User.findByIdAndDelete(userId);
    }
    async findUserById(id){
        return User.findById(id).select('-password');
    }
    findById(id) {
        return this.findUserById(id);
    }
    findByIdForAuthentication(id) {
        return User.findById(id).select('+password');
    }
    async updateProfile(id, profile) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
            throw new TypeError('Profile update must be an object');
        }

        const permittedUpdates = {};
        if (hasOwn(profile, 'email')) {
            permittedUpdates.email = normalizeEmail(profile.email);
        }
        if (Object.keys(permittedUpdates).length === 0) return this.findById(id);

        if (typeof permittedUpdates.email === 'string') {
            const existingUser = await User.findOne({
                email: permittedUpdates.email,
                _id: { $ne: id },
            }).select('_id');
            if (existingUser) throw duplicateEmailError();
        }

        try {
            return await User.findByIdAndUpdate(
                id,
                { $set: permittedUpdates },
                { new: true, runValidators: true }
            ).select('-password');
        } catch (error) {
            if (isDuplicateEmailError(error)) throw duplicateEmailError();
            throw error;
        }
    }
    async updatePassword(id, newPassword) {
        if (typeof newPassword !== 'string' || newPassword.length === 0) {
            throw new TypeError('New password must be a non-empty string');
        }

        const hashedPassword = await hashPassword(newPassword);
        return User.findByIdAndUpdate(
            id,
            { $set: { password: hashedPassword } },
            { new: true, runValidators: true }
        ).select('-password');
    }
    async assignMagasin(userId,magasinId){
        return User.findByIdAndUpdate(userId,{magasinId:magasinId},{
            new:true,
            runValidators:true
        });
    }
}
module.exports=new userRepository();
