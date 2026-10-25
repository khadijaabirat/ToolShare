const mongoose= require('mongoose');
 
const UserSchema=new  mongoose.Schema({
    nom:{
        type:String,
        required:true,
        trim:true
    },
    prenom:{
        type:String,
        required:true,
        trim:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true
    },
    password:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:['Admin', 'Gestionnaire', 'Utilisateur'],
        default:'Utilisateur',
       required:true
    },
    magasinId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Magasin',
        required:function(){
            return this.role==='Gestionnaire';
        }
    },
    isActive:{
        type:Boolean,
        default:true
    },
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User'
    }
},{
    timestamps:true
});

UserSchema.methods.toJSON=function(){
    const user= this.toObject();
    delete user.password;
    return user;
}
module.exports=mongoose.model('User',UserSchema);