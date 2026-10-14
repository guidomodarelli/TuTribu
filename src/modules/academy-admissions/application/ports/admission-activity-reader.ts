/** Keeps authorized history and aggregate reads independent of SQL, secrets and providers. @module admission-activity-reader */
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionActivityPage } from "../results/admission-activity-result";
import type { AdmissionMetricsResult } from "../results/admission-metrics-result";
/** Boundary-normalized selection never grants access to the selected resources. */
export type AdmissionActivityFilters = { limit: number; resourceType?: AdmissionActivityPage["items"][number]["resourceType"]; resourceId?: string; cursor?: { at: string; id: string } };
/** Infrastructure supplies only owned results after rechecking native authority. */
export interface AdmissionActivityReader {
  /** @param scope - Native current actor/session and exact tribe. @param filters - Bounded selection. @returns A private same-tribe page and its immutable tuple cursor. */
  readActivity(scope: AdmissionCommandScope, filters: AdmissionActivityFilters): Promise<AdmissionActivityPage>;
  /** @param scope - Native current actor/session and exact tribe. @returns Real counts, UTC usage and observed timings without personal dimensions. */
  readMetrics(scope: AdmissionCommandScope): Promise<AdmissionMetricsResult>;
}
