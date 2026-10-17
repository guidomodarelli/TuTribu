/** Reads the existing bounded own reviewer endpoints without changing page or decision authority. @module admission-review-refresh-client */
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionReviewVisibleSnapshot } from "@/src/modules/academy-admissions/application/results/admission-review-visible-snapshot";
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

/** @returns A safe own read failure without exposing a malformed cursor or unexpected resource. */
function unavailable(): AdmissionBrowserResult<AdmissionReviewVisibleSnapshot> { return { status: "failed", code: ADMISSION_ERROR_CODE.resourceUnavailable, message: ADMISSION_REVIEW_UI_COPY.readFailed, uncertain: false }; }

/**
 * Reconciles exactly the number of pages the user loaded, retaining the same filters.
 * @param input - Existing own client and current container-owned cancellation/selection fence.
 * @returns A complete current window or one controlled failure; a partial read never replaces cached rows.
 */
export async function readVisibleAdmissionReviewSnapshot(input: { readonly client: AdmissionReviewBrowserClient; readonly slug: string; readonly filters: AdmissionReviewSelection; readonly pages: number; readonly selectedId?: string; readonly signal: AbortSignal; readonly isCurrent: () => boolean }): Promise<AdmissionBrowserResult<AdmissionReviewVisibleSnapshot>> {
  if (!Number.isSafeInteger(input.pages) || input.pages < 1) return unavailable();
  const rows = new Map<string, AdmissionReviewDto>(), cursors = new Set<string>();
  let cursor: string | null = null;
  const current = () => !input.signal.aborted && input.isCurrent();
  for (let pageIndex = 0; pageIndex < input.pages; pageIndex += 1) {
    if (!current()) return { status: "aborted" };
    const page = await input.client.reviewList(input.slug, cursor, input.signal, input.filters);
    if (!current()) return { status: "aborted" };
    if (page.status !== "ready") return page;
    for (const request of page.value.items) { const previous = rows.get(request.id); if (!previous || request.version >= previous.version) rows.set(request.id, request); }
    cursor = page.value.nextCursor;
    if (cursor === null) break;
    if (cursors.has(cursor)) return unavailable();
    cursors.add(cursor);
  }
  let selected: AdmissionReviewDto | null = null;
  if (input.selectedId) {
    const detail = await input.client.reviewDetail(input.slug, input.selectedId, input.signal);
    if (!current()) return { status: "aborted" };
    if (detail.status !== "ready") return detail;
    if (detail.value.id !== input.selectedId) return unavailable();
    selected = detail.value;
  }
  return { status: "ready", value: { items: Array.from(rows.values()), nextCursor: cursor, selected } };
}
