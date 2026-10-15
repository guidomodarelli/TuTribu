/** Separates editable activity filters from the last applied bounded selection. @module admission-activity-filter-draft */
import type { AdmissionActivityPageSelection } from "../results/admission-activity-page-state";
import { admissionActivityPageSelectionSchema } from "../../constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_FILTER_ALL } from "../../constants/admission-activity-labels";
import { ADMISSION_ACTIVITY_UI_COPY } from "../../constants/admission-activity-browser";

/** Browser input remains a string until validated immediately before a read. */
export type AdmissionActivityFilterDraft = { resourceType: string; resourceId: string };
/** @param selection - Last acknowledged server selection. @returns Editable filters without carrying a pagination cursor into a new search. */
export function createAdmissionActivityFilterDraft(selection: AdmissionActivityPageSelection): AdmissionActivityFilterDraft {
  return { resourceType: selection.resourceType ?? ADMISSION_ACTIVITY_FILTER_ALL, resourceId: selection.resourceId ?? "" };
}
/** @param draft - Current user edits. @param limit - Existing bounded page size. @returns An own selection or safe feedback, without opening transport. */
export function parseAdmissionActivityFilterDraft(draft: AdmissionActivityFilterDraft, limit: number) {
  const resourceId = draft.resourceId.trim();
  const parsed = admissionActivityPageSelectionSchema.safeParse({ limit,
    ...(draft.resourceType !== ADMISSION_ACTIVITY_FILTER_ALL ? { resourceType: draft.resourceType } : {}),
    ...(resourceId ? { resourceId: resourceId.toLowerCase() } : {}),
  });
  return parsed.success ? { ok: true as const, value: parsed.data } : { ok: false as const, message: ADMISSION_ACTIVITY_UI_COPY.invalidFilter };
}
