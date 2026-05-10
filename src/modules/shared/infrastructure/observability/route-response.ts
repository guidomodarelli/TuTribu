import { attachRequestIdToResponse } from "./request-context";

export function createRedirectResponse(
  url: URL | string,
  requestId: string,
  status?: number
): Response {
  return attachRequestIdToResponse(Response.redirect(url, status), requestId);
}
