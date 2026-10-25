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
    
}
module.exports=new userRepository();