import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";

const URL_QUERY_SEPARATOR = "?";

/**
 * Builds the sign-in URL that returns to an internal path after
 * authentication. The return path is query-encoded so paths with their own
 * query string (or reserved characters) survive the round trip intact. Pure
 * and framework-safe, so server entrypoints and route handlers share it.
 *
 * @param returnPath - Internal path, optionally with a query string.
 * @returns Sign-in URL such as `/auth/signin?callbackUrl=%2Fslug%2Feventos`.
 */
export function buildSignInRedirectUrl(returnPath: string): string {
  const signInSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: returnPath,
  });

  return ROUTES.auth.signIn + URL_QUERY_SEPARATOR + signInSearchParams.toString();
}
