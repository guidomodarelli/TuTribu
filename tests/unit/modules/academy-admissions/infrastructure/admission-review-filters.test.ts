/** @vitest-environment node */
/** Exercises reviewer form, UTC range and route boundary contracts without platform doubles. @module admission-review-filters-tests */
import { describe, expect, it } from "vitest";
import { createAdmissionReviewFilterDraft, parseAdmissionReviewFilterDraft, buildAdmissionReviewSelectionRoute } from "@/lib/academy-admissions/admission-review-filters";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { admissionReviewPageInputSchema } from "@/src/modules/academy-admissions/constants/admission-review-page-input";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";

describe("reviewer selection continuity", () => {
  it("should preserve the original sub-millisecond cutoff when editing another filter", () => {
    const selection = { ...DEFAULT_ADMISSION_REVIEW_SELECTION, submittedUntil: "2026-10-07T00:00:00.123500Z" };
    const draft = { ...createAdmissionReviewFilterDraft(selection), search: "Primer" };
    expect(parseAdmissionReviewFilterDraft("synthetic-academy", draft, selection.limit, { original: selection })).toMatchObject({ ok: true, filters: { submittedUntil: selection.submittedUntil, search: "Primer" } });
  });

  it("should accept an intentionally edited date even when it matches the rounded display of the original cutoff", () => {
    const selection = { ...DEFAULT_ADMISSION_REVIEW_SELECTION, submittedUntil: "2026-10-07T00:00:00.123500Z" };
    const draft = createAdmissionReviewFilterDraft(selection);
    expect(parseAdmissionReviewFilterDraft("synthetic-academy", draft, selection.limit, { original: selection, editedDates: new Set(["submittedUntil"]) })).toMatchObject({ ok: true, filters: { submittedUntil: "2026-10-07T00:00:00Z" } });
  });

  it("should round trip normalized filters, explicit false and encoded search through the real page boundary", () => {
    const selection = { limit: 25, source: "common" as const, search: "Ana + García & request=ajena", needsVerification: false, requiresExceptionReason: true, submittedFrom: "2026-10-01T08:00:00-03:00", submittedUntil: "2026-10-08T12:00:00Z" };
    const draft = createAdmissionReviewFilterDraft(selection);
    // The form shows the cut in Argentina time, at minute precision.
    expect(draft.submittedFrom).toBe("2026-10-01T08:00");
    const parsed = parseAdmissionReviewFilterDraft("synthetic-academy", draft, selection.limit);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("The valid public selection was rejected");
    const route = new URL(buildAdmissionReviewSelectionRoute("synthetic-academy", parsed.filters), "https://tutribu.example.invalid");
    const input = admissionReviewPageInputSchema.parse({ params: { slug: "synthetic-academy" }, query: Object.fromEntries(route.searchParams) });
    expect(input.query).toMatchObject({ limit: selection.limit, status: undefined, source: selection.source, search: selection.search, needsVerification: false, requiresExceptionReason: true });
    expect(new Date(input.query.submittedFrom!).getTime()).toBe(new Date(selection.submittedFrom).getTime());
    expect(route.searchParams.has("request")).toBe(false);
    expect(route.origin).toBe("https://tutribu.example.invalid");
  });

  it("should retain an unrestricted selection separately from false and restore the initial pending default", () => {
    const draft = createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION);
    expect(parseAdmissionReviewFilterDraft("synthetic-academy", draft, 25)).toEqual({ ok: true, filters: DEFAULT_ADMISSION_REVIEW_SELECTION });
    const input = admissionReviewPageInputSchema.parse({ params: { slug: "synthetic-academy" }, query: {} });
    expect(input.query).toEqual(DEFAULT_ADMISSION_REVIEW_SELECTION);
  });

  it("should read a typed cut with seconds in Argentina time", () => {
    const draft = { ...createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION), submittedFrom: "2026-10-01T10:00:30" };
    expect(parseAdmissionReviewFilterDraft("synthetic-academy", draft, 25)).toMatchObject({ ok: true, filters: { submittedFrom: "2026-10-01T13:00:30Z" } });
  });

  it.each(["2026-02-30T10:00", "2026-10-01T25:00", "2026-10-01T10:00:99", "unusable"])("should reject an impossible date %s instead of rolling it into another day", (submittedFrom) => {
    const draft = { ...createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION), submittedFrom };
    expect(parseAdmissionReviewFilterDraft("synthetic-academy", draft, 25)).toEqual({ ok: false });
  });

  it("should reject invalid selection values and oversized search without substituting another meaning", () => {
    const draft = createAdmissionReviewFilterDraft(DEFAULT_ADMISSION_REVIEW_SELECTION);
    for (const change of [{ status: "unknown" }, { source: "exception" }, { needsVerification: "1" }, { requiresExceptionReason: "" }, { search: "a".repeat(ADMISSION_QUERY_LIMIT.searchCharacters + 1) }]) {
      expect(parseAdmissionReviewFilterDraft("synthetic-academy", { ...draft, ...change }, 25)).toEqual({ ok: false });
    }
  });
});
