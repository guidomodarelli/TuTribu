/** Keeps sign-in return addresses inside the app; pure, so server entrypoints and client controls share it. @module safe-callback-url */

/** Every internal return path starts at the app root. */
const INTERNAL_PATH_PREFIX = "/";
/**
 * Placeholder origin used only to resolve a callback path the way a browser
 * would. A callback is accepted when it stays on this origin, which rejects
 * protocol-relative tricks such as `//host`, `/\host` or `/<tab>/host`.
 */
const CALLBACK_URL_RESOLUTION_ORIGIN = "https://callback.invalid";

/**
 * Keeps only same-origin callback paths. The candidate is resolved with the
 * WHATWG URL parser, the same one browsers apply to `Location` and meta
 * refresh targets, so backslashes and stripped control characters cannot turn
 * a path into a protocol-relative URL that leaves the app.
 *
 * @param rawCallbackUrl - Untrusted callback candidate, such as a `callbackUrl` search param or the current address.
 * @param fallbackPath - Internal path used when the candidate is missing or unsafe.
 * @returns The normalized internal path (with search and hash) or the fallback.
 */
export function resolveSafeCallbackUrl(rawCallbackUrl: string | null, fallbackPath: string): string {
  if (!rawCallbackUrl) return fallbackPath;
  const trimmedCallbackUrl = rawCallbackUrl.trim();
  if (!trimmedCallbackUrl.startsWith(INTERNAL_PATH_PREFIX)) return fallbackPath;
  let resolvedCallbackUrl: URL;
  try {
    resolvedCallbackUrl = new URL(trimmedCallbackUrl, CALLBACK_URL_RESOLUTION_ORIGIN);
  } catch {
    // Unparseable input is untrusted: fall back to the internal default path.
    return fallbackPath;
  }
  if (resolvedCallbackUrl.origin !== CALLBACK_URL_RESOLUTION_ORIGIN) return fallbackPath;
  return resolvedCallbackUrl.pathname + resolvedCallbackUrl.search + resolvedCallbackUrl.hash;
}
