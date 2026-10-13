/** Owns explicit recency-intent creation without starting OAuth or authorizing a product mutation. @module reauthentication-intent-browser-client-port */
import type { ReauthenticationOperation } from "../../constants/reauthentication-resources";
export type ReauthenticationIntentBrowserResult = { status: "ready"; href: string } | { status: "failed" } | { status: "aborted" };
export interface ReauthenticationIntentBrowserClient {
  create(command: { tribeId: string; resourceId: string; operation: ReauthenticationOperation; returnPath: string; confirmed: true }, signal: AbortSignal): Promise<ReauthenticationIntentBrowserResult>;
}
