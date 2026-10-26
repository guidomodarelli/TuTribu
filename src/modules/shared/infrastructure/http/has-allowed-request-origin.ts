/** Compares browser origin with the current native request without deriving identity from headers. @module has-allowed-request-origin */
import { HTTP_ORIGIN_HEADER, HTTP_ORIGIN_INTERNAL_HOST } from "../../constants/http-origin";
import { resolvePublicAppBaseUrl } from "../backend/public-app-base-url";
/**
 * Compares the browser origin with native routing or the configured public origin behind loopback.
 * @param request - Native request whose Host may identify the local proxy destination.
 * @returns Direct same-origin traffic, the exact configured public origin on an internal matching port,
 * or nonbrowser traffic without Origin; authentication remains independently required.
 */
export function hasAllowedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get(HTTP_ORIGIN_HEADER.origin);
  if (!origin) return true;
  try {
    const source = new URL(origin), destination = new URL(request.url);
    const host = request.headers.get(HTTP_ORIGIN_HEADER.host)?.trim().toLowerCase() ?? destination.host;
    if (source.origin !== origin) return false;
    if (source.host === host && source.protocol === destination.protocol) return true;
    const publicOrigin = new URL(resolvePublicAppBaseUrl());
    if (source.origin !== publicOrigin.origin) return false;
    const internalHostnames = Object.values(HTTP_ORIGIN_INTERNAL_HOST);
    const inbound = new URL(`${destination.protocol}//${host}`);
    return inbound.host === host && inbound.port === destination.port
      && internalHostnames.some((hostname) => hostname === inbound.hostname)
      && internalHostnames.some((hostname) => hostname === destination.hostname);
  } catch { return false; }
}
