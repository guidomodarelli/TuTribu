"use client";

import { createAuthClient } from "better-auth/client";

import { ROUTES } from "@/src/constants/routes";

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
