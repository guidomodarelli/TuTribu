/** @vitest-environment node */
/** Exercises atomic visible-window reads at the existing owned client port, without framework or provider mocks. @module admission-review-visible-refresh-tests */
import { describe, expect, it, vi } from "vitest";
import { readVisibleAdmissionReviewSnapshot } from "@/lib/academy-admissions/admission-review-refresh-client";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

/** @returns Only controlled own HTTP-port readers and one genuine public display DTO. */
function fixture() {
  const request: AdmissionReviewDto = { id: "e3f861a5-771c-462c-bbce-e24987ec6488", status: "pending", version: 1, submittedAt: "2026-10-16T12:00:00Z", expiresAt: "2100-11-06T12:00:00Z", source: "common", needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], applicant: { id: "synthetic-reader", name: "Persona sintética" }, rawContact: "reader@example.test", contact: { type: "email", maskedValue: "r•••@example.test", evidenceKind: "declared" }, evidence: { kind: "declared" }, eligibleActions: ["approve", "reject"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null }, applicantMessage: "Solicitud de prueba." };
  const client = { viewer: vi.fn<AdmissionReviewBrowserClient["viewer"]>(), reviewList: vi.fn<AdmissionReviewBrowserClient["reviewList"]>(async () => ({ status: "ready", value: { items: [request], nextCursor: "own-next-page" } })), reviewDetail: vi.fn<AdmissionReviewBrowserClient["reviewDetail"]>(async () => ({ status: "ready", value: request })), operation: vi.fn<AdmissionReviewBrowserClient["operation"]>(), decideBatch: vi.fn<AdmissionReviewBrowserClient["decideBatch"]>(), decide: vi.fn<AdmissionReviewBrowserClient["decide"]>() } satisfies AdmissionReviewBrowserClient;
  const input = { client, slug: "visible-review", filters: { limit: 1 }, pages: 2, selectedId: request.id, signal: new AbortController().signal, isCurrent: () => true };
  return { client, request, input };
}

describe("owned visible admission review window", () => {
  it("should withhold the entire partial window when a later loaded page cannot be read", async () => {
    const test = fixture();
    test.client.reviewList.mockResolvedValueOnce({ status: "ready", value: { items: [test.request], nextCursor: "own-next-page" } }).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos actualizar la ventana.", uncertain: false });
    const result = await readVisibleAdmissionReviewSnapshot(test.input);
    expect(result).toMatchObject({ status: "failed", code: "dependency_unavailable" });
    expect(result).not.toHaveProperty("value");
    expect(test.client.reviewDetail).not.toHaveBeenCalled();
    expect(test.client.decide).not.toHaveBeenCalled();
  });

  it("should stop a repeated cursor rather than presenting a repeated page as a complete current window", async () => {
    const test = fixture();
    expect(await readVisibleAdmissionReviewSnapshot(test.input)).toMatchObject({ status: "failed", code: "resource_unavailable" });
    expect(test.client.reviewList).toHaveBeenCalledTimes(2);
    expect(test.client.reviewDetail).not.toHaveBeenCalled();
  });

  it("should stop before another page or selected detail when the current manual view supersedes the read", async () => {
    const test = fixture();
    let current = true;
    test.client.reviewList.mockImplementationOnce(async () => { current = false; return { status: "ready", value: { items: [test.request], nextCursor: "own-next-page" } }; });
    expect(await readVisibleAdmissionReviewSnapshot({ ...test.input, isCurrent: () => current })).toEqual({ status: "aborted" });
    expect(test.client.reviewList).toHaveBeenCalledTimes(1);
    expect(test.client.reviewDetail).not.toHaveBeenCalled();
  });
});
