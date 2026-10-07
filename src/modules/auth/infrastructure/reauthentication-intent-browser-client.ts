"use client";
/** Creates exact global recency intents over own same-origin HTTP without OAuth or retries. @module reauthentication-intent-browser-client */
import type { ReauthenticationIntentBrowserClient } from "../application/ports/reauthentication-intent-browser-client";
import { reauthenticationIntentResultSchema } from "../application/results/reauthentication-intent-result";
import { REAUTHENTICATION_ROUTES } from "../constants/reauthentication-ui";
import { GLOBAL_REAUTHENTICATION_INTENT_STATE } from "../constants/recent-authentication";
import { REAUTHENTICATION_INTENT_OUTCOME } from "../constants/reauthentication-intents";
/** @param transport - Own HTTP port. @returns A cancellation-aware creator with a guarded local continuation URL. */
export function createReauthenticationIntentBrowserClient(transport: typeof fetch = fetch): ReauthenticationIntentBrowserClient {
  return { async create(command, signal) {
    if (signal.aborted) return { status: "aborted" };
    try {
      const response = await transport(REAUTHENTICATION_ROUTES.intents, { method: "POST", credentials: "same-origin", cache: "no-store", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      if (signal.aborted) return { status: "aborted" };
      if (!response.ok) return { status: "failed" };
      const result = reauthenticationIntentResultSchema.safeParse(await response.json());
      if (signal.aborted) return { status: "aborted" };
      if (!result.success || result.data.returnPath !== command.returnPath || result.data.state !== GLOBAL_REAUTHENTICATION_INTENT_STATE.created || result.data.outcome !== REAUTHENTICATION_INTENT_OUTCOME.pending) return { status: "failed" };
      return { status: "ready", href: `${REAUTHENTICATION_ROUTES.page}?${new URLSearchParams({ intentId: result.data.intentId })}` };
    } catch { return signal.aborted ? { status: "aborted" } : { status: "failed" }; }
  } };
}
