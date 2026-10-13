/** Compares browser origin with the current native request without deriving identity from headers. @module has-allowed-request-origin */
import { HTTP_ORIGIN_HEADER } from "../../constants/http-origin";
/** @param request - Native request. @returns Same-origin browser traffic or nonbrowser traffic without Origin; authentication remains independently required. */
export function hasAllowedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get(HTTP_ORIGIN_HEADER.origin);
  if (!origin) return true;
  try {
    const source = new URL(origin), destination = new URL(request.url);
    const host = request.headers.get(HTTP_ORIGIN_HEADER.host)?.trim().toLowerCase() ?? destination.host;
    return source.origin === origin && source.host === host && source.protocol === destination.protocol;
  } catch { return false; }
}
