/** Names HTTP protocol statuses shared by feature boundaries. */
export const HTTP_STATUS = {
  ok: 200, created:201, accepted: 202, badRequest: 400, unauthorized: 401, forbidden: 403,
  notFound: 404, requestTimeout: 408, conflict: 409, unprocessableEntity: 422, tooManyRequests: 429,
  serverError: 500, badGateway: 502, serviceUnavailable: 503,
} as const;
