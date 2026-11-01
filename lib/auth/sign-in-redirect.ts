import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";

const URL_QUERY_SEPARATOR = "?";
/** Value of the account chooser flag on the sign-in URL. */
export const SIGN_IN_ACCOUNT_CHOOSER_VALUE = "1";

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

/**
 * Builds the sign-in URL an explicit account change opens after signing out: Google then shows its account chooser instead of
 * signing the only open Google session in again.
 *
 * @param returnPath - Internal path, optionally with a query string.
 * @returns Sign-in URL such as `/auth/signin?callbackUrl=%2Fadmissions%2Fslug&selectAccount=1`.
 */
export function buildAccountChangeSignInUrl(returnPath: string): string {
  const signInSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: returnPath,
    [QUERY_PARAMS.auth.selectAccount]: SIGN_IN_ACCOUNT_CHOOSER_VALUE,
  });

  return ROUTES.auth.signIn + URL_QUERY_SEPARATOR + signInSearchParams.toString();
}
