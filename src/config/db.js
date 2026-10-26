const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[Database] MongoDB connecté : ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Database Error] Échec de connexion : ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
