/** Chooses the exit a messaging page offers when its server snapshot could not be read. @module messaging-route-recovery */
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { reloadCurrentPage } from "@/lib/browser-navigation";

/** What the failed page offers: signing in, retrying, or only leaving. */
export type MessagingRouteRecovery = { retry?: () => void; signInHref?: string };

/**
 * @param code - The failure of the server snapshot, or `null` when it was read and the page failed afterwards.
 * @param returnPath - Path to come back to after signing in.
 * @returns Sign-in for a missing session, no retry for a permission denial (retrying cannot grant it), and a fresh
 * document for every other failure.
 */
export function resolveMessagingRouteRecovery(code: MessagingErrorCode | null, returnPath: string): MessagingRouteRecovery {
  if (code === MESSAGING_ERROR_CODE.authenticationRequired) return { signInHref: buildSignInRedirectUrl(returnPath) };
  if (code === MESSAGING_ERROR_CODE.permissionDenied) return {};
  return { retry: reloadCurrentPage };
}
