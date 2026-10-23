const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erreur serveur';

   if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  res.status(statusCode).json({
    message
  });
};

module.exports = errorHandler;
