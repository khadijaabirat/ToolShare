const User=require('../models/User');

class userRepository{
    async createUser(userData){
        return await User.create(userData);
    }
    async findByEmail(email){
        return await User.findOne({email});
    }
}
module.exports=new userRepository();