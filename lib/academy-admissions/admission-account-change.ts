/** Chooses where an explicit admission account change returns, without reading a session. @module admission-account-change */
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { ROUTES } from "@/src/constants/routes";
import { buildAdmissionEntryRoute } from "./admission-routes";

/**
 * @param input - Arrival return path and published state.
 * @returns Where another account lands after an account change: the arrival or the tribe entry, never the own request of the account that
 * left, which the next one cannot read.
 */
export function resolveAccountChangeReturnPath({ arrivalReturnPath, state }: { arrivalReturnPath?: string; state: AdmissionPageState }): string {
  if (arrivalReturnPath) return arrivalReturnPath;
  return state.kind === "ready" ? buildAdmissionEntryRoute(state.overview.tribe.slug) : state.returnPath ?? ROUTES.home;
}
