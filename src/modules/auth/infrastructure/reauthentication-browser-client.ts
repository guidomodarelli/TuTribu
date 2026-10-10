"use client";

/** Uses the real native SDK for OAuth and validates only the application's public read DTO. */
import { createAuthClient } from "better-auth/client";
import { HTTP_STATUS } from "@/src/constants/http-status";
import type { ReauthenticationBrowserClient } from "@/src/modules/auth/application/ports/reauthentication-browser-client";
import { reauthenticationPageIntentSchema } from "@/src/modules/auth/application/results/reauthentication-page-result";
import { REAUTHENTICATION_ERROR_CODE } from "@/src/modules/auth/constants/reauthentication-intents";
import { REAUTHENTICATION_ROUTES } from "@/src/modules/auth/constants/reauthentication-ui";
import { AUTH_EVIDENCE_INTENT_STATE_KEY } from "@/src/modules/auth/constants/auth-evidence-capture";
import { GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";

/** Maps known transport rejection before any untrusted provider or API message. */
function failureCode(status: number) {
  if (status === HTTP_STATUS.unauthorized) return REAUTHENTICATION_ERROR_CODE.notAuthenticated;
  if (status === HTTP_STATUS.forbidden) return REAUTHENTICATION_ERROR_CODE.contextUnavailable;
  if (status === HTTP_STATUS.notFound) return REAUTHENTICATION_ERROR_CODE.notFound;
  return REAUTHENTICATION_ERROR_CODE.unexpected;
}

/**
 * Creates one owned browser client without changing public Better Auth login behavior.
 * @param fetcher - Same-origin transport used by the API and the real SDK.
 * @returns Abortable read/start operations that never infer verification from browser success.
 */
export function createReauthenticationBrowserClient(fetcher: typeof fetch = fetch): ReauthenticationBrowserClient {
  const authClient = createAuthClient({ fetchOptions: { customFetchImpl: fetcher } });
  return {
    async start(intentId, signal) {
      const callbackURL = `${REAUTHENTICATION_ROUTES.page}?${new URLSearchParams({ intentId })}`;
      try {
        const result = await authClient.signIn.social({ provider: GOOGLE_IDENTITY_PROVIDER, callbackURL, errorCallbackURL: callbackURL, additionalData: { [AUTH_EVIDENCE_INTENT_STATE_KEY]: intentId }, fetchOptions: { signal } });
        if (signal.aborted) return { status: "aborted" };
        return result.error ? { status: "failed", code: failureCode(result.error.status) } : { status: "started" };
      } catch {
        return signal.aborted ? { status: "aborted" } : { status: "failed", code: REAUTHENTICATION_ERROR_CODE.unexpected };
      }
    },
    async read(intentId, signal) {
      try {
        const response = await fetcher(`${REAUTHENTICATION_ROUTES.intents}/${encodeURIComponent(intentId)}`, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
        if (signal.aborted) return { status: "aborted" };
        if (!response.ok) return { status: "failed", code: failureCode(response.status) };
        const parsed = reauthenticationPageIntentSchema.safeParse(await response.json());
        if (signal.aborted) return { status: "aborted" };
        return parsed.success && parsed.data.intentId === intentId ? { status: "ready", intent: parsed.data } : { status: "failed", code: REAUTHENTICATION_ERROR_CODE.unusableContract };
      } catch {
        return signal.aborted ? { status: "aborted" } : { status: "failed", code: REAUTHENTICATION_ERROR_CODE.unexpected };
      }
    },
  };
}

/** Shares one static native client while keeping every request's abort signal and intent separate. */
export const reauthenticationBrowserClient = createReauthenticationBrowserClient();
