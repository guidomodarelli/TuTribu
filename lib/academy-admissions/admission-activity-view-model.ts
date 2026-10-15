/** Maps selected own audit facts to display rows without dumping arbitrary payload objects. @module admission-activity-view-model */
import type { AdmissionActivityPage } from "@/src/modules/academy-admissions/application/results/admission-activity-result";
import { ADMISSION_ACTIVITY_CHANGE_LABELS, ADMISSION_POLICY_SNAPSHOT_LABELS, ADMISSION_OBSERVATION_COPY } from "@/src/modules/academy-admissions/constants/admission-activity-labels";
import { formatAdmissionObservationDuration, formatAdmissionObservationTime } from "./admission-observation-format";

/** Display values preserve the exact safe reference values needed to reconstruct an owner transition. */
export type AdmissionActivityDetailRow = { label: string; value: string };
/** Own contract aliases do not introduce a provider or database-row dependency into presentation. */
type ActivityChanges = AdmissionActivityPage["items"][number]["changes"];
type PolicySnapshot = NonNullable<ActivityChanges["toPolicy"]>;

/** @param value - One guarded own primitive or country array. @returns Safe display copy without interpreting reference identifiers as human identity. */
function displayPrimitive(value: string | number | boolean | readonly string[] | null): string {
  if (value === null) return ADMISSION_OBSERVATION_COPY.absent;
  if (typeof value === "boolean") return value ? ADMISSION_OBSERVATION_COPY.yes : ADMISSION_OBSERVATION_COPY.no;
  if (Array.isArray(value)) return value.length ? value.join(", ") : ADMISSION_OBSERVATION_COPY.absent;
  return String(value);
}

/**
 * Chooses only named fields of the existing own historical DTO and its policy snapshots.
 * @param changes - Already guarded owner facts; no JSON body, provider profile or free note is accepted.
 * @returns Stable labeled rows with explicit absence; current configuration is never read or replaced.
 */
export function createAdmissionActivityDetailRows(changes: ActivityChanges): AdmissionActivityDetailRow[] {
  const rows: AdmissionActivityDetailRow[] = [];
  for (const [name, label] of Object.entries(ADMISSION_ACTIVITY_CHANGE_LABELS)) {
    const field = name as keyof ActivityChanges, value = changes[field];
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const policy = value as PolicySnapshot;
      for (const [policyName, policyLabel] of Object.entries(ADMISSION_POLICY_SNAPSHOT_LABELS)) {
        const policyValue = policy[policyName as keyof PolicySnapshot];
        rows.push({ label: `${label} · ${policyLabel}`, value: policyName === "activatedAt" && typeof policyValue === "string" ? formatAdmissionObservationTime(policyValue) : displayPrimitive(policyValue) });
      }
    } else {
      rows.push({ label, value: field === "durationMs" && typeof value === "number" ? formatAdmissionObservationDuration(value) : field === "cutoff" && typeof value === "string" ? formatAdmissionObservationTime(value) : displayPrimitive(value) });
    }
  }
  return rows;
}
