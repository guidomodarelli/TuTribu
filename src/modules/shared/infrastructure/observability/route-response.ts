import { attachRequestIdToResponse } from "./request-context";

const JSON_CONTENT_TYPE = "application/json";

export function createRedirectResponse(
  url: URL | string,
  requestId: string,
  status?: number
): Response {
  return attachRequestIdToResponse(Response.redirect(url, status), requestId);
}

export function createJsonResponse(
  body: string,
  init: ResponseInit,
  requestId: string
): Response {
  const response = new Response(body, {
    ...init,
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      ...init.headers,
    },
  });

  return attachRequestIdToResponse(response, requestId);
}
