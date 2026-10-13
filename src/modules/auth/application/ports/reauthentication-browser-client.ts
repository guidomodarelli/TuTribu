/** Defines the route container's owned transport boundary without SDK or HTTP objects. */
import type { ReauthenticationIntentResult, ReauthenticationFailure } from "@/src/modules/auth/application/results/reauthentication-intent-result";

export type ReauthenticationReadResult = { status: "ready"; intent: ReauthenticationIntentResult } | { status: "failed"; code: ReauthenticationFailure["code"] } | { status: "aborted" };
export type ReauthenticationStartResult = { status: "started" } | { status: "failed"; code: ReauthenticationFailure["code"] } | { status: "aborted" };

/** Starts once explicitly and reads the current intent without creating another one. */
export interface ReauthenticationBrowserClient {
  start(intentId: string, signal: AbortSignal): Promise<ReauthenticationStartResult>;
  read(intentId: string, signal: AbortSignal): Promise<ReauthenticationReadResult>;
}
