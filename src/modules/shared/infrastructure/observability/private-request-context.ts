/** Selects only bounded opaque correlation headers for private request diagnostics. @module private-request-context */
import { PRIVATE_HTTP_CORRELATION_ID_PATTERN } from "../../constants/private-http";
import { REQUEST_ID_HEADER, TRACE_ID_HEADER, resolveRequestContext, type RequestContext } from "./request-context";

/**
 * Preserves usable native correlation without carrying cookies, bodies or rejected header values.
 * @param source - Native incoming headers; no identity is derived from these values.
 * @returns Safe request/trace IDs, generated when an incoming value is absent or unusable.
 */
export function resolvePrivateRequestContext(source: Pick<Headers, "get">): RequestContext {
  const headers = new Headers();
  for (const name of [REQUEST_ID_HEADER,TRACE_ID_HEADER]) {
    const value = source.get(name)?.trim();
    if (value && PRIVATE_HTTP_CORRELATION_ID_PATTERN.test(value)) headers.set(name,value);
  }
  return resolveRequestContext(headers);
}
