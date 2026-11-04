/** Chooses the exit an admission or messaging page offers when its server snapshot or a private read fails. @module admission-route-recovery */
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_TRANSIENT_PAGE_ERROR_CODES } from "@/src/modules/academy-admissions/constants/admission-ui";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { reloadCurrentPage } from "@/lib/browser-navigation";

/** What the failed page offers: signing in, retrying, opening the page without its query, or only leaving. */
export type AdmissionRouteRecovery = { retry?: () => void; signInHref?: string; initialViewHref?: string };

/** Current address of the failed page, as `usePathname` and `useSearchParams` give it (search without `?`). */
export type AdmissionRouteLocation = { pathname: string; search: string };

/** Codes that a reload of the same address always repeats; transient codes are listed in `ADMISSION_TRANSIENT_PAGE_ERROR_CODES`. */
const ADDRESS_BOUND_ERROR_CODES: ReadonlySet<string> = new Set<AdmissionErrorCode>([
  ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable, ADMISSION_ERROR_CODE.invitationUnavailable,
]);
const TRANSIENT_ERROR_CODES: ReadonlySet<string> = new Set(ADMISSION_TRANSIENT_PAGE_ERROR_CODES);

/**
 * Follows the documented recovery rule: «Iniciar sesión» (back to the same address) for a missing session, «Reintentar» only for a
 * failure that can pass, and no retry for a deterministic refusal. When the refusal comes from the address itself (an extra
 * parameter, a manipulated cursor, a selected request that does not exist), the page can be opened again without its query.
 * Messaging codes share these values, so its pages use the same rule.
 * @param code - Closed failure of the snapshot or read, or `null` when the page failed for a reason without a code.
 * @param location - Current address of the page.
 * @param retry - What retrying does; a fresh document by default.
 * @returns The exits to render next to the safe message.
 */
export function resolveAdmissionRouteRecovery(code: string | null, location: AdmissionRouteLocation, retry: () => void = reloadCurrentPage): AdmissionRouteRecovery {
  if (code === ADMISSION_ERROR_CODE.authenticationRequired) return { signInHref: buildSignInRedirectUrl(location.search ? `${location.pathname}?${location.search}` : location.pathname) };
  if (code === null || TRANSIENT_ERROR_CODES.has(code)) return { retry };
  if (ADDRESS_BOUND_ERROR_CODES.has(code) && location.search) return { initialViewHref: location.pathname };
  return {};
}
