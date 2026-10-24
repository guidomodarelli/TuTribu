/** Exposes only native viewer checks and the own private snapshot for explicit UI reads. @module admission-activity-browser-client */
import type { AdmissionBrowserClient, AdmissionBrowserResult } from "./admission-browser-client";
import type { AdmissionActivityPageSelection, AdmissionActivityReadyPageState } from "../results/admission-activity-page-state";

/** Reading cannot initialize settings, issue messages or mutate their versions. */
export interface AdmissionActivityBrowserClient extends Pick<AdmissionBrowserClient, "viewer"> {
  /** @param slug - The current SSR academy. @param selection - Bounded applied filters. @param signal - Exact active view cancellation. @returns One same-route own result or a controlled read failure. */
  read(slug: string, selection: AdmissionActivityPageSelection, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionActivityReadyPageState>>;
}
