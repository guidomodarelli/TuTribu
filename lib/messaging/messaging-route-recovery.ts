/** Chooses the exit a messaging page offers when its server snapshot could not be read. @module messaging-route-recovery */
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import { resolveAdmissionRouteRecovery, type AdmissionRouteLocation, type AdmissionRouteRecovery } from "@/lib/academy-admissions/admission-route-recovery";

/** What the failed page offers: signing in, retrying, opening the page without its query, or only leaving. */
export type MessagingRouteRecovery = AdmissionRouteRecovery;

/**
 * Messaging pages live in the admission workspace and share its closed codes, so they follow the same rule.
 * @param code - The failure of the server snapshot, or `null` when it was read and the page failed afterwards.
 * @param returnTo - Path and query to come back to after signing in; the query keeps the page's navigation intent,
 * such as the way back to the rules.
 * @returns Sign-in for a missing session, no retry for a deterministic refusal (permission, invalid input, missing resource),
 * and a fresh document for every failure that can pass.
 */
export function resolveMessagingRouteRecovery(code: MessagingErrorCode | null, returnTo: AdmissionRouteLocation): MessagingRouteRecovery {
  return resolveAdmissionRouteRecovery(code, returnTo);
}
