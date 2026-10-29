/**
 * HTTP status codes answered by the API route handlers.
 *
 * @module route-http-status
 */

/** Named HTTP status codes shared by the API route handlers. */
export const HTTP_STATUS = {
  badRequest: 400,
  conflict: 409,
  created: 201,
  forbidden: 403,
  found: 302,
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;
