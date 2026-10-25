/** Chooses the exit a messaging page offers when its server snapshot could not be read. @module messaging-route-recovery */
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { reloadCurrentPage } from "@/lib/browser-navigation";

/** What the failed page offers: signing in, retrying, or only leaving. */
export type MessagingRouteRecovery = { retry?: () => void; signInHref?: string };

/**
 * @param code - The failure of the server snapshot, or `null` when it was read and the page failed afterwards.
 * @param returnTo - Path and query to come back to after signing in; the query keeps the page's navigation intent,
 * such as the way back to the rules.
 * @returns Sign-in for a missing session, no retry for a permission denial (retrying cannot grant it), and a fresh
 * document for every other failure.
 */
export function resolveMessagingRouteRecovery(code: MessagingErrorCode | null, returnTo: { pathname: string; search: string }): MessagingRouteRecovery {
  if (code === MESSAGING_ERROR_CODE.authenticationRequired) return { signInHref: buildSignInRedirectUrl(returnTo.search ? `${returnTo.pathname}?${returnTo.search}` : returnTo.pathname) };
  if (code === MESSAGING_ERROR_CODE.permissionDenied) return {};
  return { retry: reloadCurrentPage };
}
