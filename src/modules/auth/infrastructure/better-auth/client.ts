"use client";

import { createAuthClient } from "better-auth/client";

import { ROUTES } from "@/src/constants/routes";
import { navigateToUrl } from "@/lib/browser-navigation";
import {
  DEV_SIGN_IN_REJECTED_HTTP_STATUS,
  DEV_SIGN_IN_RESULT,
  type DevSignInResult,
} from "@/src/modules/auth/constants/dev-sign-in";
import {
  MEMBER_SESSION_REFRESH_STATUS,
  type MemberSessionRefreshStatus,
} from "@/src/modules/auth/constants/session";

const AUTH_CLIENT_ERROR = {
  googleSignInRejected: "Better Auth rejected Google sign-in.",
  signOutRejected: "Better Auth rejected sign-out.",
  googleRedirectUrlMissing: "Better Auth returned no Google authorization URL.",
} as const;
const GOOGLE_SOCIAL_PROVIDER = "google";
/** Google authorization parameter that selects its screens. */
const GOOGLE_PROMPT_PARAM = "prompt";
/** Shows the Google account chooser and still asks for the offline consent the provider configuration requests. */
const GOOGLE_ACCOUNT_CHOOSER_PROMPT = "select_account consent";

const authClient = createAuthClient();

type AuthClientError = {
  message?: string;
};

type AuthClientResult = {
  error?: AuthClientError | null;
};

function throwIfAuthClientFailed(
  result: AuthClientResult | undefined,
  fallbackMessage: string
) {
  const authClientError = result?.error;

  if (!authClientError) {
    return;
  }

  throw new Error(authClientError.message ?? fallbackMessage);
}

/**
 * @param authorizationUrl - Google authorization URL Better Auth prepared, with its own state.
 * @returns The same URL asking Google for its account chooser; every other parameter is kept.
 */
export function withGoogleAccountChooser(authorizationUrl: string): string {
  const url = new URL(authorizationUrl);
  url.searchParams.set(GOOGLE_PROMPT_PARAM, GOOGLE_ACCOUNT_CHOOSER_PROMPT);
  return url.toString();
}

/**
 * Starts the Google OAuth redirect.
 *
 * @param callbackUrl - Internal path to return to after sign-in.
 * @param options - `selectAccount` asks Google for its account chooser, for an explicit account change; the provider configuration stays the same.
 */
export async function startGoogleSignIn(callbackUrl: string, options: { selectAccount?: boolean } = {}) {
  if (!options.selectAccount) {
    const result = await authClient.signIn.social({
      callbackURL: callbackUrl,
      errorCallbackURL: ROUTES.auth.error,
      provider: GOOGLE_SOCIAL_PROVIDER,
    });

    throwIfAuthClientFailed(result, AUTH_CLIENT_ERROR.googleSignInRejected);
    return;
  }

  // Better Auth prepares the authorization URL and its state; only the prompt changes before the browser leaves for Google.
  const result = await authClient.signIn.social({
    callbackURL: callbackUrl,
    disableRedirect: true,
    errorCallbackURL: ROUTES.auth.error,
    provider: GOOGLE_SOCIAL_PROVIDER,
  });

  throwIfAuthClientFailed(result, AUTH_CLIENT_ERROR.googleSignInRejected);
  const authorizationUrl = result.data?.url;
  if (!authorizationUrl) throw new Error(AUTH_CLIENT_ERROR.googleRedirectUrlMissing);
  navigateToUrl(withGoogleAccountChooser(authorizationUrl));
}

/**
 * Signs in with the development-only email and password method. The server
 * registers it only on `next dev` with `DEV_SIGN_IN` set.
 *
 * @param email - Email typed in the development form.
 * @param password - Password typed in the development form.
 * @returns `signed-in` once Better Auth set the session cookie,
 * `invalid-credentials` when the email or password was rejected, and `failed`
 * for any other error, including the method being unavailable.
 */
export async function startDevSignIn(
  email: string,
  password: string
): Promise<DevSignInResult> {
  try {
    const result = await authClient.signIn.email({ email, password });

    if (!result.error) {
      return DEV_SIGN_IN_RESULT.signedIn;
    }

    return Object.values(DEV_SIGN_IN_REJECTED_HTTP_STATUS).some(
      (rejectedStatus) => rejectedStatus === result.error.status
    )
      ? DEV_SIGN_IN_RESULT.invalidCredentials
      : DEV_SIGN_IN_RESULT.failed;
  } catch {
    // Network failures map to a stable result so the form shows Spanish copy.
    return DEV_SIGN_IN_RESULT.failed;
  }
}

export async function signOutMember() {
  const result = await authClient.signOut();

  throwIfAuthClientFailed(result, AUTH_CLIENT_ERROR.signOutRejected);
}

/**
 * Status Better Auth answers when the session disappeared while it was being
 * renewed (for example, a concurrent sign-out); it also clears the cookie.
 */
const SESSION_REJECTED_HTTP_STATUS = 401;

/**
 * Asks the Better Auth session endpoint to renew the member session. The route
 * handler slides the 180-day expiration and returns the refreshed cookie, which
 * Server Components cannot do. Failures map to a stable status because the
 * keep-alive is best-effort: the current page stays usable either way.
 *
 * @param signal - Aborts the request when the caller unmounts.
 * @param renderedMemberId - Member the server rendered the page for.
 * @returns `active` when the session still belongs to the rendered member,
 * `expired` when the server no longer recognizes it (or it now belongs to
 * another member, so the rendered identity is stale), and `failed` when the
 * endpoint or network errored.
 */
export async function refreshMemberSession(
  signal: AbortSignal,
  renderedMemberId: string
): Promise<MemberSessionRefreshStatus> {
  try {
    const result = await authClient.getSession({ fetchOptions: { signal } });

    if (result.error) {
      return result.error.status === SESSION_REJECTED_HTTP_STATUS
        ? MEMBER_SESSION_REFRESH_STATUS.expired
        : MEMBER_SESSION_REFRESH_STATUS.failed;
    }

    return result.data?.user.id === renderedMemberId
      ? MEMBER_SESSION_REFRESH_STATUS.active
      : MEMBER_SESSION_REFRESH_STATUS.expired;
  } catch {
    // Network failures and aborts are transient: keep the rendered page as is.
    return MEMBER_SESSION_REFRESH_STATUS.failed;
  }
}
