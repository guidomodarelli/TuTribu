/** Limits the usage container to its exact initialization or update recency purpose. @module messaging-usage-reauthentication-client-port */
import type { ReauthenticationIntentBrowserResult } from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import type { MESSAGING_USAGE_RECOVERABLE_OPERATION } from "../../constants/messaging-usage";
export interface MessagingUsageReauthenticationClient {
  create(command: { tribeId: string; resourceId: string; operation: typeof MESSAGING_USAGE_RECOVERABLE_OPERATION[keyof typeof MESSAGING_USAGE_RECOVERABLE_OPERATION]; returnPath: string; confirmed: true }, signal: AbortSignal): Promise<ReauthenticationIntentBrowserResult>;
}
