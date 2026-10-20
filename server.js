require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/toolshare';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

async function connectToMongo() {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      console.log('Connected to MongoDB');
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function start() {
  await connectToMongo();
  app.listen(port, () => {
    console.log(`ToolShare API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Could not start the API:', error.message);
  process.exit(1);
});
