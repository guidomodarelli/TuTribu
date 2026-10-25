/** Maps only own reviewer form fields to bounded route selections and navigation. @module admission-review-filters */
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_REVIEW_FILTER_ANY } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";
import { BUENOS_AIRES_UTC_OFFSET } from "@/src/constants/date-time";
import { ADMISSION_REVIEW_ALL_STATUSES } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { admissionReviewPageInputSchema } from "@/src/modules/academy-admissions/constants/admission-review-page-input";
import { admissionReviewSelectionQuery } from "./admission-review-selection";

/** Editable strings do not represent permissions or persisted reviewer commands. */
export type AdmissionReviewFilterDraft = { search: string; status: string; source: string; needsVerification: string; requiresExceptionReason: string; submittedFrom: string; submittedUntil: string };
/** An explicit edit can intentionally replace a finer original cut with the displayed precision. */
export type AdmissionReviewDateFilter = "submittedFrom" | "submittedUntil";
/** Original instants retain all admitted precision until that specific date is edited. */
type FilterDraftContext = { original: AdmissionReviewSelection; editedDates?: ReadonlySet<AdmissionReviewDateFilter> };

/** @param filters - Safe normalized server selection. @returns A deterministic form in Argentina time, without reading the browser locale or time zone. */
export function createAdmissionReviewFilterDraft(filters: AdmissionReviewSelection): AdmissionReviewFilterDraft {
  return {
    search: filters.search ?? "", status: filters.status ?? ADMISSION_REVIEW_ALL_STATUSES, source: filters.source ?? ADMISSION_REVIEW_FILTER_ANY,
    needsVerification: filters.needsVerification === undefined ? ADMISSION_REVIEW_FILTER_ANY : String(filters.needsVerification),
    requiresExceptionReason: filters.requiresExceptionReason === undefined ? ADMISSION_REVIEW_FILTER_ANY : String(filters.requiresExceptionReason),
    submittedFrom: filters.submittedFrom ? toBuenosAiresMinuteKey(new Date(filters.submittedFrom)) : "",
    submittedUntil: filters.submittedUntil ? toBuenosAiresMinuteKey(new Date(filters.submittedUntil)) : "",
  };
}

/** Milliseconds the HTTP contract never needs: a filter cut is a minute or a second. */
const WHOLE_SECOND_FRACTION = ".000Z";

/**
 * @param value - Native datetime-local input, read as Argentina time.
 * @returns The UTC instant it names for the HTTP contract, or the raw value so the boundary schema rejects it.
 */
function argentinaInstant(value: string): string {
  const instant = fromBuenosAiresMinuteKey(value) ?? new Date(value + BUENOS_AIRES_UTC_OFFSET);
  return Number.isFinite(instant.getTime()) ? instant.toISOString().replace(WHOLE_SECOND_FRACTION, "Z") : value;
}

/** @param field - Selected date control. @param draft - Current editable strings. @param context - Optional applied baseline and explicit edit tracking. @returns Its complete original ISO when unchanged, otherwise the newly entered candidate or absence. */
function selectedInstant(field: AdmissionReviewDateFilter, draft: AdmissionReviewFilterDraft, context?: FilterDraftContext): string | undefined {
  if (context && !context.editedDates?.has(field) && draft[field] === createAdmissionReviewFilterDraft(context.original)[field]) return context.original[field];
  return draft[field] ? argentinaInstant(draft[field]) : undefined;
}

/** @param slug - Current server-projected route scope. @param draft - Untrusted editable strings. @param limit - Applied bounded page size. @param context - Original date precision and controls explicitly edited by the user. @returns A safe selection or an explicit validation failure before navigation. */
export function parseAdmissionReviewFilterDraft(slug: string, draft: AdmissionReviewFilterDraft, limit: number, context?: FilterDraftContext): { ok: true; filters: AdmissionReviewSelection } | { ok: false } {
  const submittedFrom = selectedInstant("submittedFrom", draft, context), submittedUntil = selectedInstant("submittedUntil", draft, context);
  const parsed = admissionReviewPageInputSchema.safeParse({ params: { slug }, query: {
    limit, status: draft.status,
    ...(draft.search.trim() ? { search: draft.search } : {}),
    ...(draft.source !== ADMISSION_REVIEW_FILTER_ANY ? { source: draft.source } : {}),
    ...(draft.needsVerification !== ADMISSION_REVIEW_FILTER_ANY ? { needsVerification: draft.needsVerification } : {}),
    ...(draft.requiresExceptionReason !== ADMISSION_REVIEW_FILTER_ANY ? { requiresExceptionReason: draft.requiresExceptionReason } : {}),
    ...(submittedFrom !== undefined ? { submittedFrom } : {}),
    ...(submittedUntil !== undefined ? { submittedUntil } : {}),
  } });
  if (!parsed.success) return { ok: false };
  const { [ADMISSION_NAVIGATION.requestQuery]: _selectedId, ...filters } = parsed.data.query;
  return { ok: true, filters };
}

/** @param slug - Current academy slug. @param filters - Validated own selection. @returns A same-origin reviewer route retaining all filters and clearing any previous selected detail. */
export function buildAdmissionReviewSelectionRoute(slug: string, filters: AdmissionReviewSelection): string {
  const query = new URLSearchParams({ ...admissionReviewSelectionQuery(filters), status: filters.status ?? ADMISSION_REVIEW_ALL_STATUSES });
  return `/${encodeURIComponent(slug)}/${ADMISSION_NAVIGATION.reviewSegment}?${query}`;
}
