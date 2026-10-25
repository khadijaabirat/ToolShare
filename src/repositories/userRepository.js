const User=require('../models/User');

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
}
module.exports=new userRepository();