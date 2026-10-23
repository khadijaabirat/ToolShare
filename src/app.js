const express = require('express');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.use('/api', apiRoutes);

 app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

 app.use(errorHandler);

module.exports = app;
