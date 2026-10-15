/** Defines one private UI snapshot with current settings kept separate from historical observations. @module admission-activity-page-state */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import type { AdmissionActivityPage } from "./admission-activity-result";
import type { AdmissionMetricsResult } from "./admission-metrics-result";
import type { MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";

/** Carries bounded selection, never actor, role or a claimed permission. */
export type AdmissionActivityPageSelection = { limit: number; resourceType?: AdmissionActivityPage["items"][number]["resourceType"]; resourceId?: string; cursor?: string };
/** Preserves independent clocks and versions; history and metrics never replace current configuration. */
export type AdmissionActivityReadyPageState = {
  kind: "ready"; slug: string; tribeId: string; viewerId: string; renderedAt: string;
  selection: AdmissionActivityPageSelection;
  activity: AdmissionActivityPage;
  metrics: AdmissionMetricsResult;
  currentUsage: MessagingUsagePolicyStateResult;
};
/** A failed authorization or read exposes no partial administrative snapshot. */
export type AdmissionActivityPageState = AdmissionActivityReadyPageState | { kind: "unavailable"; code: AdmissionErrorCode; message: string };

