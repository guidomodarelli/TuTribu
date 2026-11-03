/** Maps only own reviewer form fields to bounded route selections and navigation. @module admission-review-filters */
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_REVIEW_FILTER_ANY, ADMISSION_REVIEW_FILTER_DATES, ADMISSION_REVIEW_FILTER_GROUPS, ADMISSION_REVIEW_FILTER_MINUTE_KEY_PATTERN } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { fromBuenosAiresMinuteKey, toBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_REVIEW_ALL_STATUSES, DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { admissionReviewPageInputSchema } from "@/src/modules/academy-admissions/constants/admission-review-page-input";
import { omitKeys } from "@/lib/object-omit";
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

/** A field the filter dialog edits; the search stays in the toolbar, next to the button that opens the dialog. */
export type AdmissionReviewDialogField = Exclude<keyof AdmissionReviewFilterDraft, "search">;
/** One applied dialog filter, in the words its chip shows. */
export type AdmissionReviewAppliedFilter = { id: AdmissionReviewDialogField; label: string; value: string };

/**
 * @param minuteKey - Argentina minute of a date filter, as the datetime-local control holds it.
 * @returns The same minute as DD/MM/AAAA HH:mm, built from the key alone so server and browser render the same text.
 */
function chipMinute(minuteKey: string): string {
  const parts = ADMISSION_REVIEW_FILTER_MINUTE_KEY_PATTERN.exec(minuteKey);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]} ${parts[4]}` : minuteKey;
}

/**
 * @param filters - Applied server selection.
 * @returns One chip per dialog field that differs from the initial pending selection, in the dialog's order.
 */
export function describeAdmissionReviewDialogFilters(filters: AdmissionReviewSelection): AdmissionReviewAppliedFilter[] {
  const applied = createAdmissionReviewFilterDraft(filters), initial = createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION);
  const groups = ADMISSION_REVIEW_FILTER_GROUPS.filter((group) => applied[group.field] !== initial[group.field]).map((group): AdmissionReviewAppliedFilter => {
    const options: ReadonlyArray<{ value: string; label: string }> = group.options;
    return { id: group.field, label: group.label, value: options.find((option) => option.value === applied[group.field])?.label ?? applied[group.field] };
  });
  const dates = ADMISSION_REVIEW_FILTER_DATES.filter((date) => applied[date.field] !== initial[date.field]).map((date): AdmissionReviewAppliedFilter => ({ id: date.field, label: date.chipLabel, value: chipMinute(applied[date.field]) }));
  return [...groups, ...dates];
}

/**
 * @param draft - Current editable strings.
 * @param filters - Applied server selection.
 * @param field - Dialog filter whose chip was removed.
 * @returns The applied selection with that field back on the initial pending value and the toolbar search untouched.
 */
export function removeAdmissionReviewDialogFilter(draft: AdmissionReviewFilterDraft, filters: AdmissionReviewSelection, field: AdmissionReviewDialogField): AdmissionReviewFilterDraft {
  return { ...discardAdmissionReviewDialogEdits(draft, filters), [field]: createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION)[field] };
}

/**
 * @param draft - Current editable strings.
 * @param filters - Applied server selection.
 * @returns The draft with every dialog field back on the applied selection and the toolbar search untouched.
 */
export function discardAdmissionReviewDialogEdits(draft: AdmissionReviewFilterDraft, filters: AdmissionReviewSelection): AdmissionReviewFilterDraft {
  return { ...createAdmissionReviewFilterDraft(filters), search: draft.search };
}

/** Milliseconds the HTTP contract never needs: a filter cut is a minute or a second. */
const WHOLE_SECOND_FRACTION = ".000Z";
/** A typed cut with seconds: its minute part, then seconds from 00 to 59 and an optional fraction. */
const SECONDS_CUT_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):([0-5]\d(?:\.\d{1,3})?)$/u;

/**
 * @param value - Native datetime-local input, read as Argentina time.
 * @returns The UTC instant it names for the HTTP contract, or the raw value so the boundary schema rejects it.
 */
function argentinaInstant(value: string): string {
  // Only a real calendar minute converts: an impossible date such as 02-30 is never rolled into another day.
  const seconds = SECONDS_CUT_PATTERN.exec(value), minute = fromBuenosAiresMinuteKey(seconds ? seconds[1] : value);
  if (!minute) return value;
  const instant = seconds ? new Date(minute.getTime() + Number(seconds[2]) * MILLISECONDS_PER_SECOND) : minute;
  return instant.toISOString().replace(WHOLE_SECOND_FRACTION, "Z");
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
  return { ok: true, filters: omitKeys(parsed.data.query, [ADMISSION_NAVIGATION.requestQuery]) };
}

/** @param slug - Current academy slug. @param filters - Validated own selection. @returns A same-origin reviewer route retaining all filters and clearing any previous selected detail. */
export function buildAdmissionReviewSelectionRoute(slug: string, filters: AdmissionReviewSelection): string {
  const query = new URLSearchParams({ ...admissionReviewSelectionQuery(filters), status: filters.status ?? ADMISSION_REVIEW_ALL_STATUSES });
  return `/${encodeURIComponent(slug)}/${ADMISSION_NAVIGATION.reviewSegment}?${query}`;
}
