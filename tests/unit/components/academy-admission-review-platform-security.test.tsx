/** The reviewer inbox explains a platform that cannot protect decisions, offers none and never keeps a platform refusal as uncertain. @module academy-admission-review-platform-security-tests */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionReviewRouteContainer } from "@/app/(platform)/[slug]/academia/admissions/admission-review-route-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_BATCH_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/admission-batch-review-ui";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { PLATFORM_SECURITY_NOTICE_COPY, PLATFORM_SECURITY_REQUIREMENT_COPY } from "@/src/modules/academy-admissions/constants/platform-security-notice";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

const requestId = "2b71737c-2f11-4dbb-853d-080bda9628e5", operationId = "a86a3f18-a48e-4600-a057-f90e1931f7b0";
const viewerId = "synthetic-platform-reviewer", slug = "synthetic-platform-academy";
const router = { back: vi.fn(), bfcacheId: "admission-review-platform", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
const PLATFORM_REFUSAL = { status: "failed" as const, code: ADMISSION_ERROR_CODE.platformSecurityUnavailable, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.platformSecurityUnavailable], uncertain: false };

/** Real framework and UI providers, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** @param decisions - Decisions the server offers for the request. @returns One pending public review projection. */
function pendingReview(decisions: AdmissionReviewDto["eligibleActions"]): AdmissionReviewDto {
  return { id: requestId, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2100-11-06T01:00:00Z", source: "common", needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], applicant: { id: "synthetic-applicant", name: "Solicitante sintético" }, rawContact: "applicant@example.test", contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" }, evidence: { kind: "declared" }, eligibleActions: decisions, restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null } };
}

/**
 * @param platformRequirement - What the server read reports, or null when decisions can be protected.
 * @param selected - Whether the detail is open.
 * @returns The route input and doubles of the owned transport port only.
 */
function fixture(platformRequirement: PlatformSecurityRequirement | null, selected = false) {
  const request = pendingReview(platformRequirement ? [] : ["reject", "approve"]);
  const page = { items: [request], nextCursor: null, platformRequirement };
  const state: Extract<AdmissionReviewPageState, { kind: "ready" }> = { kind: "ready", viewerId, slug, renderedAt: "2026-10-07T01:00:00Z", filters: DEFAULT_ADMISSION_REVIEW_SELECTION, page, selected: selected ? request : null };
  const client = {
    viewer: vi.fn<AdmissionReviewBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    reviewList: vi.fn<AdmissionReviewBrowserClient["reviewList"]>(async () => ({ status: "ready", value: page })),
    reviewDetail: vi.fn<AdmissionReviewBrowserClient["reviewDetail"]>(async () => ({ status: "ready", value: request })),
    operation: vi.fn<AdmissionReviewBrowserClient["operation"]>(async () => ({ status: "failed", code: ADMISSION_ERROR_CODE.resourceUnavailable, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.resourceUnavailable], uncertain: false })),
    decide: vi.fn<AdmissionReviewBrowserClient["decide"]>(async () => PLATFORM_REFUSAL),
    decideBatch: vi.fn<AdmissionReviewBrowserClient["decideBatch"]>(async () => PLATFORM_REFUSAL),
  };
  return { request, state, client, node: <AdmissionReviewRouteContainer initialState={state} client={client} /> };
}

/** Fills the reasons and confirms the open request once the current read made it interactive. */
async function confirmDecision() {
  await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
  fireEvent.change(screen.getByLabelText(new RegExp(`^${ADMISSION_REVIEW_UI_COPY.internalReasonRequired}`)), { target: { value: "Revisión manual registrada" } });
  fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("reviewer inbox while the platform cannot protect decisions", () => {
  it.each([PLATFORM_SECURITY_REQUIREMENT.unconfigured, PLATFORM_SECURITY_REQUIREMENT.recoveryLocked])("should explain the %s requirement above the inbox and offer neither a decision nor a batch selection", async (requirement) => {
    const data = fixture(requirement);
    await act(async () => { render(data.node, { wrapper: Providers }); });

    const notice = screen.getByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    expect(notice).toHaveTextContent(PLATFORM_SECURITY_REQUIREMENT_COPY[requirement]);
    expect(notice).toHaveTextContent(ADMISSION_REVIEW_UI_COPY.platformConsequence);
    expect(screen.getByRole("checkbox", { name: `${ADMISSION_BATCH_REVIEW_COPY.selectPrefix} ${data.request.applicant.name}` })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${data.request.applicant.name}` }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Detalle de la solicitud" })).toBeVisible());
    expect(screen.getByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).toBeVisible();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).not.toBeInTheDocument();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should show the notice once a current read reports the requirement and remove it when a later read no longer does", async () => {
    const data = fixture(null, true), blocked = { items: [pendingReview([])], nextCursor: null, platformRequirement: PLATFORM_SECURITY_REQUIREMENT.recoveryLocked };
    data.client.reviewList.mockResolvedValueOnce({ status: "ready", value: blocked });
    data.client.reviewDetail.mockResolvedValueOnce({ status: "ready", value: blocked.items[0] });
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
    expect(screen.queryByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    expect(await screen.findByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).toHaveTextContent(PLATFORM_SECURITY_REQUIREMENT_COPY.recovery_locked);
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    await waitFor(() => expect(screen.queryByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeVisible();
  });

  it("should release a refused individual decision instead of keeping it uncertain or offering to resend it", async () => {
    const data = fixture(null, true);
    render(data.node, { wrapper: Providers });
    await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_REFUSAL.message));
    expect(data.client.decide).toHaveBeenCalledOnce();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
    expect(screen.queryByText(ADMISSION_REVIEW_UI_COPY.uncertain)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).not.toBeInTheDocument();
    // The refusal is not an absence or a lost permission: the request stays visible.
    expect(screen.getByRole("region", { name: "Detalle de la solicitud" })).toBeVisible();
  });

  it("should release a refused batch decision instead of keeping it pending", async () => {
    const data = fixture(null);
    render(data.node, { wrapper: Providers });
    const checkbox = await screen.findByRole("checkbox", { name: `${ADMISSION_BATCH_REVIEW_COPY.selectPrefix} ${data.request.applicant.name}` });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    const form = screen.getByRole("region", { name: "Decidir solicitudes seleccionadas" });
    fireEvent.change(within(form).getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason), { target: { value: "Revisión explícita del lote" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" }));
    fireEvent.click(within(form).getByRole("button", { name: ADMISSION_BATCH_REVIEW_COPY.reject }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_REFUSAL.message));
    expect(data.client.decideBatch).toHaveBeenCalledOnce();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).not.toBeInTheDocument();
  });

  it("should release a stored decision the registry does not have while the platform cannot protect it, instead of offering to resend it", async () => {
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Motivo conservado" } });
    const data = fixture(PLATFORM_SECURITY_REQUIREMENT.unconfigured);
    await act(async () => { render(data.node, { wrapper: Providers }); });

    await waitFor(() => expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull());
    expect(data.client.operation).toHaveBeenCalledExactlyOnceWith(slug, operationId, expect.any(AbortSignal));
    expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_REFUSAL.message);
    expect(screen.queryByText(ADMISSION_REVIEW_UI_COPY.uncertain)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).not.toBeInTheDocument();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should still offer the exact original after a genuine absence when the platform can protect it", async () => {
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Motivo conservado" } });
    const data = fixture(null, true);
    await act(async () => { render(data.node, { wrapper: Providers }); });

    expect(await screen.findByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).toBeInTheDocument();
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
  });
});
