"use client";
/** Selects the shared global creator for explicit usage recency; presenters never import it. @module messaging-usage-reauthentication-client */
import type { MessagingUsageReauthenticationClient } from "@/src/modules/messaging/application/ports/messaging-usage-reauthentication-client";
import { createReauthenticationIntentBrowserClient } from "@/src/modules/auth/infrastructure/reauthentication-intent-browser-client";
/** @param transport - Own same-origin HTTP port. @returns A creator limited by the usage application's operation type. */
export function createMessagingUsageReauthenticationClient(transport: typeof fetch = fetch): MessagingUsageReauthenticationClient { return createReauthenticationIntentBrowserClient(transport); }
/** No request begins until an explicit container action. */
export const messagingUsageReauthenticationClient = createMessagingUsageReauthenticationClient();
