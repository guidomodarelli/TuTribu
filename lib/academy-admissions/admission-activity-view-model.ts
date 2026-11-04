/** Maps selected own audit facts to display rows without dumping arbitrary payload objects. @module admission-activity-view-model */
import type { AdmissionActivityPage } from "@/src/modules/academy-admissions/application/results/admission-activity-result";
import { ADMISSION_ACTIVITY_CHANGE_LABELS, ADMISSION_POLICY_SNAPSHOT_LABELS, ADMISSION_OBSERVATION_COPY } from "@/src/modules/academy-admissions/constants/admission-activity-labels";
import { ADMISSION_ACTIVITY_ACTOR_LABEL, ADMISSION_ACTIVITY_AUTOMATIC_RULES, ADMISSION_ACTIVITY_CAUSE_LABELS, ADMISSION_ACTIVITY_CHANGE_VALUE_LABELS, ADMISSION_ACTIVITY_RULE_COPY, ADMISSION_ACTIVITY_RULE_LABELS, ADMISSION_POLICY_SNAPSHOT_VALUE_LABELS } from "@/src/modules/academy-admissions/constants/admission-activity-value-labels";
import { formatAdmissionObservationDuration, formatAdmissionObservationTime } from "./admission-observation-format";

/** Display values preserve the exact safe reference values needed to reconstruct an owner transition. */
export type AdmissionActivityDetailRow = { label: string; value: string };
/** Own contract aliases do not introduce a provider or database-row dependency into presentation. */
type ActivityItem = AdmissionActivityPage["items"][number];
type ActivityChanges = ActivityItem["changes"];
type PolicySnapshot = NonNullable<ActivityChanges["toPolicy"]>;

/** Closed-value labels by field name, widened for lookup; each map was checked against its field when declared. */
type ClosedValueLookup = Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>;
const CHANGE_VALUE_LOOKUP: ClosedValueLookup = ADMISSION_ACTIVITY_CHANGE_VALUE_LABELS;
const POLICY_SNAPSHOT_VALUE_LOOKUP: ClosedValueLookup = ADMISSION_POLICY_SNAPSHOT_VALUE_LABELS;

/**
 * @param lookup - Closed-value labels of a contract.
 * @param field - Field the value belongs to.
 * @param value - Guarded value.
 * @returns The Spanish label of a closed value, or the safe primitive copy of a reference, version, count or free value.
 */
function displayFieldValue(lookup: ClosedValueLookup, field: string, value: string | number | boolean | readonly string[] | null): string {
  const label = typeof value === "string" ? lookup[field]?.[value] : undefined;
  return label ?? displayPrimitive(value);
}

/** @param value - One guarded own primitive or country array. @returns Safe display copy without interpreting reference identifiers as human identity. */
function displayPrimitive(value: string | number | boolean | readonly string[] | null): string {
  if (value === null) return ADMISSION_OBSERVATION_COPY.absent;
  if (typeof value === "boolean") return value ? ADMISSION_OBSERVATION_COPY.yes : ADMISSION_OBSERVATION_COPY.no;
  if (Array.isArray(value)) return value.length ? value.join(", ") : ADMISSION_OBSERVATION_COPY.absent;
  return String(value);
}

/** @param label - Change label. @param policy - Guarded policy snapshot. @returns One labeled row per present snapshot field. */
function policySnapshotRows(label: string, policy: PolicySnapshot): AdmissionActivityDetailRow[] {
  const rows: AdmissionActivityDetailRow[] = [];
  for (const [policyName, policyLabel] of Object.entries(ADMISSION_POLICY_SNAPSHOT_LABELS)) {
    const policyValue = policy[policyName as keyof PolicySnapshot];
    if (policyValue === undefined) continue;
    rows.push({ label: `${label} · ${policyLabel}`, value: policyName === "activatedAt" && typeof policyValue === "string" ? formatAdmissionObservationTime(policyValue) : displayFieldValue(POLICY_SNAPSHOT_VALUE_LOOKUP, policyName, policyValue) });
  }
  return rows;
}

/** @param field - Change field. @param value - Its guarded primitive value. @returns Display copy: durations and cutoffs formatted, closed values labeled, anything else as a primitive. */
function displayChangeValue(field: keyof ActivityChanges, value: string | number | boolean | readonly string[] | null): string {
  if (field === "durationMs" && typeof value === "number") return formatAdmissionObservationDuration(value);
  if (field === "cutoff" && typeof value === "string") return formatAdmissionObservationTime(value);
  return displayFieldValue(CHANGE_VALUE_LOOKUP, field, value);
}

/**
 * @param event - Guarded activity fact.
 * @returns The recorded account reference, «Sistema» for a rule only automatic processes apply, or «Sin atribución disponible»: a missing actor alone does not prove automation.
 */
export function describeAdmissionActivityActor(event: Pick<ActivityItem, "actorUserId" | "rule">): string {
  if (event.actorUserId !== null) return event.actorUserId;
  return event.rule !== null && ADMISSION_ACTIVITY_AUTOMATIC_RULES.has(event.rule) ? ADMISSION_ACTIVITY_ACTOR_LABEL.system : ADMISSION_ACTIVITY_ACTOR_LABEL.unattributed;
}

/** @param event - Guarded fact with its applied rule. @returns The Spanish label of the rule, a pointer to the fact when the rule only repeats its operation, or explicit absence. */
export function describeAdmissionActivityRule(event: Pick<ActivityItem, "rule" | "eventType">): string {
  if (event.rule === null) return ADMISSION_OBSERVATION_COPY.absent;
  return event.rule === event.eventType ? ADMISSION_ACTIVITY_RULE_COPY.ownOperation : ADMISSION_ACTIVITY_RULE_LABELS[event.rule];
}

/** @param cause - Guarded recorded cause. @returns Its short Spanish label, or explicit absence. */
export function describeAdmissionActivityCause(cause: ActivityItem["cause"]): string {
  return cause === null ? ADMISSION_OBSERVATION_COPY.absent : ADMISSION_ACTIVITY_CAUSE_LABELS[cause];
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
    if (value !== null && typeof value === "object" && !Array.isArray(value)) rows.push(...policySnapshotRows(label, value));
    else rows.push({ label, value: displayChangeValue(field, value) });
  }
  return rows;
}
