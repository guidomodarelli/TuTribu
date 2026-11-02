/** Chooses the exit a messaging page offers when its server snapshot, a private read or a write could not be completed. @module messaging-route-recovery */
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ROUTES } from "@/src/constants/routes";
import { resolveSafeCallbackUrl } from "@/lib/auth/safe-callback-url";
import { resolveAdmissionRouteRecovery, type AdmissionRouteLocation, type AdmissionRouteRecovery } from "@/lib/academy-admissions/admission-route-recovery";

/** What the failed page offers: signing in again with Google, retrying, opening the page without its query, or only leaving. */
export type MessagingRouteRecovery = Omit<AdmissionRouteRecovery, "signInHref"> & {
  /** Internal path Google sign-in returns to; set only when the session must be opened again. */
  googleSignInCallbackUrl?: string;
};

/**
 * @param location - Current address of the messaging page.
 * @returns The same page, with the query that keeps its navigation intent (such as the way back to the rules), as an internal
 * path only: anything that would leave the app falls back to the home page.
 */
export function messagingSignInCallbackUrl(location: AdmissionRouteLocation): string {
  return resolveSafeCallbackUrl(location.search ? `${location.pathname}?${location.search}` : location.pathname, ROUTES.home);
}

/** @param code - Closed failure of a messaging answer. @returns Whether its only exit is signing in again with Google. */
export function isMessagingSignInRequired(code: MessagingErrorCode | null | undefined): boolean {
  return code === MESSAGING_ERROR_CODE.authenticationRequired;
}

/**
 * Messaging pages live in the admission workspace and share its closed codes, so they follow the same rule, except for the session:
 * sensitive messaging changes also need the Google identity of the current session, which the sign-in page cannot renew while a
 * session is open. So a missing or unusable session starts Google sign-in directly, back to the same page.
 * @param code - The failure, or `null` when the page failed for a reason without a code.
 * @param location - Current address of the page.
 * @param retry - What retrying does; a fresh document by default. A failure that leaves the session usable for reads passes its own
 * read, which is offered next to signing in again.
 * @returns Google sign-in for a missing or unusable session, no retry for a deterministic refusal (permission, invalid input, missing
 * resource), and a retry for every failure that can pass.
 */
export function resolveMessagingRouteRecovery(code: MessagingErrorCode | null, location: AdmissionRouteLocation, retry?: () => void): MessagingRouteRecovery {
  if (isMessagingSignInRequired(code)) return { googleSignInCallbackUrl: messagingSignInCallbackUrl(location), ...(retry ? { retry } : {}) };
  const { retry: recoveryRetry, initialViewHref } = resolveAdmissionRouteRecovery(code, location, retry);
  return { ...(recoveryRetry ? { retry: recoveryRetry } : {}), ...(initialViewHref ? { initialViewHref } : {}) };
}
