/** Reads the existing bounded own reviewer endpoints without changing page or decision authority. @module admission-review-refresh-client */
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionReviewVisibleSnapshot } from "@/src/modules/academy-admissions/application/results/admission-review-visible-snapshot";
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

/** @returns A safe own read failure without exposing a malformed cursor or unexpected resource. */
function unavailable(): AdmissionBrowserResult<never> { return { status: "failed", code: ADMISSION_ERROR_CODE.resourceUnavailable, message: ADMISSION_REVIEW_UI_COPY.readFailed, uncertain: false }; }

/** Own reconciliation input: existing client, page window and the container-owned cancellation/selection fence. */
type VisibleSnapshotInput = { readonly client: AdmissionReviewBrowserClient; readonly slug: string; readonly filters: AdmissionReviewSelection; readonly pages: number; readonly selectedId?: string; readonly signal: AbortSignal; readonly isCurrent: () => boolean };
/** Rows of the loaded pages, keeping the newest version of each request, and the cursor after the last one. */
type VisiblePages = { rows: Map<string, AdmissionReviewDto>; cursor: string | null };

/** @param rows - Rows read so far. @param items - One page of own rows. @returns Nothing after keeping the newest version of each request. */
function mergeNewestRows(rows: Map<string, AdmissionReviewDto>, items: readonly AdmissionReviewDto[]): void {
  for (const request of items) { const previous = rows.get(request.id); if (!previous || request.version >= previous.version) rows.set(request.id, request); }
}

/** @param input - Reconciliation input. @param current - Whether the read is still current. @returns The loaded pages, or the failure/cancellation that stops the read. */
async function readVisiblePages(input: VisibleSnapshotInput, current: () => boolean): Promise<VisiblePages | AdmissionBrowserResult<never>> {
  const rows = new Map<string, AdmissionReviewDto>(), cursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < input.pages; pageIndex += 1) {
    if (!current()) return { status: "aborted" };
    const page = await input.client.reviewList(input.slug, cursor, input.signal, input.filters);
    if (!current()) return { status: "aborted" };
    if (page.status !== "ready") return page;
    mergeNewestRows(rows, page.value.items);
    cursor = page.value.nextCursor;
    if (cursor === null) break;
    if (cursors.has(cursor)) return unavailable();
    cursors.add(cursor);
  }
  return { rows, cursor };
}

/** @param input - Reconciliation input with a selected request. @param selectedId - Selected request id. @param current - Whether the read is still current. @returns The selected detail, or the failure/cancellation that stops the read. */
async function readSelectedDetail(input: VisibleSnapshotInput, selectedId: string, current: () => boolean): Promise<{ selected: AdmissionReviewDto } | AdmissionBrowserResult<never>> {
  const detail = await input.client.reviewDetail(input.slug, selectedId, input.signal);
  if (!current()) return { status: "aborted" };
  if (detail.status !== "ready") return detail;
  if (detail.value.id !== selectedId) return unavailable();
  return { selected: detail.value };
}

/**
 * Reconciles exactly the number of pages the user loaded, retaining the same filters.
 * @param input - Existing own client and current container-owned cancellation/selection fence.
 * @returns A complete current window or one controlled failure; a partial read never replaces cached rows.
 */
export async function readVisibleAdmissionReviewSnapshot(input: VisibleSnapshotInput): Promise<AdmissionBrowserResult<AdmissionReviewVisibleSnapshot>> {
  if (!Number.isSafeInteger(input.pages) || input.pages < 1) return unavailable();
  const current = () => !input.signal.aborted && input.isCurrent();
  const pages = await readVisiblePages(input, current);
  if ("status" in pages) return pages;
  let selected: AdmissionReviewDto | null = null;
  if (input.selectedId) {
    const detail = await readSelectedDetail(input, input.selectedId, current);
    if ("status" in detail) return detail;
    selected = detail.selected;
  }
  return { status: "ready", value: { items: Array.from(pages.rows.values()), nextCursor: pages.cursor, selected } };
}
