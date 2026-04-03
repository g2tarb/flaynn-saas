export const errorHandler = (error, request, reply) => {
  request.log.error(error);

  if (error.validation) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Format de données invalide.',
      statusCode: 400
    });
  }

  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Limite de requêtes atteinte. Red/Blue Team policy active.',
      statusCode: 429
    });
  }

  reply.status(500).send({
    error: 'Internal Server Error',
    message: 'Une erreur interne est survenue.',
    statusCode: 500
  });
};
