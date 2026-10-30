'use strict';

const express = require('express');
const mongoose = require('mongoose');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const swaggerUi= require('swagger-ui-express');
const swaggerDocument=require('./docs/swagger.json'); 
const app = express();

app.use(express.json({ limit: '10kb' }));
app.use('/api/docs',swaggerUi.serve,swaggerUi.setup(swaggerDocument));
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

app.use(errorHandler);

module.exports = app;
