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
