const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Erreur serveur';

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Corps JSON invalide.';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  if (statusCode >= 500) message = 'Erreur serveur';

  res.status(statusCode).json({
    message
  });
};

module.exports = errorHandler;
