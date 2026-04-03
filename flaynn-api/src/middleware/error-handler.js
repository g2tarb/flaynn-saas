export function errorHandler(error, request, reply) {
  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: 'TOO_MANY_REQUESTS',
      message: 'Vous avez dépassé la limite de requêtes autorisées.'
    });
  }

  request.log.error(error);
  return reply.code(500).send({
    error: 'INTERNAL_SERVER_ERROR'
  });
}