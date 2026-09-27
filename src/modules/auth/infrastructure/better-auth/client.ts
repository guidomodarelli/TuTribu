"use client";

import { createAuthClient } from "better-auth/client";

import { ROUTES } from "@/src/constants/routes";
import {
  MEMBER_SESSION_REFRESH_STATUS,
  type MemberSessionRefreshStatus,
} from "@/src/modules/auth/constants/session";

const AUTH_CLIENT_ERROR = {
  googleSignInRejected: "Better Auth rejected Google sign-in.",
  signOutRejected: "Better Auth rejected sign-out.",
} as const;
const GOOGLE_SOCIAL_PROVIDER = "google";

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

export async function startGoogleSignIn(callbackUrl: string) {
  const result = await authClient.signIn.social({
    callbackURL: callbackUrl,
    errorCallbackURL: ROUTES.auth.error,
    provider: GOOGLE_SOCIAL_PROVIDER,
  });

  throwIfAuthClientFailed(result, AUTH_CLIENT_ERROR.googleSignInRejected);
}

export async function signOutMember() {
  const result = await authClient.signOut();

  throwIfAuthClientFailed(result, AUTH_CLIENT_ERROR.signOutRejected);
}

/**
 * Asks the Better Auth session endpoint to renew the member session. The route
 * handler slides the 180-day expiration and returns the refreshed cookie, which
 * Server Components cannot do. Failures map to a stable status because the
 * keep-alive is best-effort: the current page stays usable either way.
 *
 * @param signal - Aborts the request when the caller unmounts.
 * @returns `active` when the session is valid, `expired` when the server no
 * longer recognizes it, and `failed` when the endpoint or network errored.
 */
export async function refreshMemberSession(
  signal: AbortSignal
): Promise<MemberSessionRefreshStatus> {
  try {
    const result = await authClient.getSession({ fetchOptions: { signal } });

    if (result.error) {
      return MEMBER_SESSION_REFRESH_STATUS.failed;
    }

    return result.data
      ? MEMBER_SESSION_REFRESH_STATUS.active
      : MEMBER_SESSION_REFRESH_STATUS.expired;
  } catch {
    return MEMBER_SESSION_REFRESH_STATUS.failed;
  }
}
