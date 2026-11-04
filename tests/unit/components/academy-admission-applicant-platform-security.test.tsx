/** A platform refusal of an applicant write is definitive: the local intent is released, never kept uncertain or resent, and the page says it depends on the TuTribu team. @module academy-admission-applicant-platform-security-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemedToaster, toast } from "@golfo/ui";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { readAdmissionDraft, writeAdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_OVERVIEW_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-overview";
import { ADMISSION_REQUEST_FLOW_COPY } from "@/src/modules/academy-admissions/constants/admission-request-flow";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

const VIEWER_ID = "synthetic-platform-applicant";
const REQUEST_ID = "7a4d8b2f-3c5e-4d9f-8a21-2b3c4d5e6f71";
const OPERATION_ID = "5c1f2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const TRIBE_SLUG = "synthetic-platform-academy";
const LEGACY_SCOPE = "a".repeat(64);
const PLATFORM_MESSAGE = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.platformSecurityUnavailable];
const PLATFORM_REFUSAL = { status: "failed" as const, code: ADMISSION_ERROR_CODE.platformSecurityUnavailable, message: PLATFORM_MESSAGE, uncertain: false };
const router = { back: vi.fn(), bfcacheId: "admission-platform-security", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** Real framework and UI providers, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}<ThemedToaster /></AppUIProvider></AppRouterContext.Provider>; }
// Sonner replays every active toast to a newly mounted toaster; dismissing them keeps each test's toasts its own.
afterEach(() => { toast.dismiss(); sessionStorage.clear(); });

/** @param arrivalScope - Historical link scope of the stored draft, if any. @returns The intent still stored for this viewer and tribe. */
function storedIntent(arrivalScope?: string) { return readAdmissionDraft(VIEWER_ID, TRIBE_SLUG, arrivalScope)?.pending ?? null; }

/** Supplies the application's own current-state and transport contracts for one applicant whose writes the platform refuses. */
function fixture() {
  const request: AdmissionRequestDto & { status: "pending" } = { id: REQUEST_ID, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2100-11-06T01:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" } };
  const state: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId: VIEWER_ID, renderedAt: "2026-10-07T01:00:00Z", request: null, overview: { tribe: { slug: TRIBE_SLUG, name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "available", nextAction: "request_admission", safeMessage: "Podés solicitar ingreso." } };
  const client: AdmissionBrowserClient = {
    viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: VIEWER_ID } })),
    overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: state.overview })),
    own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: state.request })),
    operation: vi.fn<AdmissionBrowserClient["operation"]>(async () => ({ status: "failed", code: ADMISSION_ERROR_CODE.resourceUnavailable, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.resourceUnavailable], uncertain: false })),
    submit: vi.fn<AdmissionBrowserClient["submit"]>(async () => PLATFORM_REFUSAL),
    cancel: vi.fn<AdmissionBrowserClient["cancel"]>(async () => PLATFORM_REFUSAL),
  };
  const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async () => PLATFORM_REFUSAL);
  return { state, request, client, whatsappClient: { updateWhatsappNumber } };
}

/** Walks the request flow to its final step and sends the submission. */
async function sendSubmission() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
  fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
}

/** @returns Nothing once no uncertainty, absence or resend of the original is offered. */
function expectNothingUncertain() {
  expect(screen.queryByText(ADMISSION_UI_COPY.uncertain)).not.toBeInTheDocument();
  expect(screen.queryByText(ADMISSION_UI_COPY.absent)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: ADMISSION_UI_COPY.retryOriginal })).not.toBeInTheDocument();
}

describe("applicant writes the platform cannot protect", () => {
  it("should release a refused submission, read the page again and keep the refusal in the submission step", async () => {
    const data = fixture();
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await sendSubmission();

    const flow = screen.getByRole("form", { name: ADMISSION_REQUEST_FLOW_COPY.submitLabel });
    await waitFor(() => expect(within(flow).getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE));
    expect(screen.getAllByText(PLATFORM_MESSAGE)).toHaveLength(1);
    expect(storedIntent()).toBeNull();
    expect(data.client.overview).toHaveBeenCalled();
    expectNothingUncertain();
  });

  it("should replace the form with the closed entry when the fresh read shows the platform closed admissions, keeping the refusal on the page", async () => {
    const data = fixture();
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "closed", nextAction: "contact_leader", safeMessage: ADMISSION_OVERVIEW_MESSAGE.closed } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await sendSubmission();

    await waitFor(() => expect(screen.queryByRole("form", { name: ADMISSION_REQUEST_FLOW_COPY.submitLabel })).not.toBeInTheDocument());
    expect(screen.getByText(ADMISSION_OVERVIEW_MESSAGE.closed)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE);
    expect(storedIntent()).toBeNull();
    expectNothingUncertain();
  });

  it("should show a refused cancellation as a platform refusal next to the cancel action, not as a missing permission", async () => {
    const data = fixture(); data.state.request = data.request; data.state.overview = { ...data.state.overview, state: "pending", nextAction: "view_request", request: data.request };
    render(<AdmissionContainer initialState={data.state} client={data.client} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.cancel }));

    const status = screen.getByRole("region", { name: "Estado de tu solicitud" });
    await waitFor(() => expect(within(status).getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE));
    expect(screen.queryByText(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.permissionDenied])).not.toBeInTheDocument();
    expect(storedIntent()).toBeNull();
    expectNothingUncertain();
  });

  it("should show a refused WhatsApp correction in its own form and release it", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview = { ...data.state.overview, state: "pending", nextAction: "view_request", request: own };
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: own });
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={data.whatsappClient} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));

    await waitFor(() => expect(within(screen.getByRole("form", { name: ADMISSION_WHATSAPP_COPY.editTitle })).getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE));
    expect(data.whatsappClient.updateWhatsappNumber).toHaveBeenCalledOnce();
    expect(storedIntent()).toBeNull();
    expectNothingUncertain();
  });

  it("should release a retained original once its resend is refused by the platform, instead of keeping the page waiting for it", async () => {
    const data = fixture();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: TRIBE_SLUG, draft: { phone: "", country: "", message: "" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, confirmed: true, expectedPolicyVersion: 1 } } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const retry = await screen.findByRole("button", { name: ADMISSION_UI_COPY.retryOriginal });
    await waitFor(() => expect(retry).toBeEnabled());

    await act(async () => { fireEvent.click(retry); });

    await waitFor(() => expect(storedIntent()).toBeNull());
    expect(data.client.submit).toHaveBeenCalledExactlyOnceWith(TRIBE_SLUG, expect.objectContaining({ operationId: OPERATION_ID }), expect.any(AbortSignal));
    expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE);
    expectNothingUncertain();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
  });

  it("should release a refused submission from a historical admission link under its own arrival scope", async () => {
    const data = fixture();
    render(<AdmissionContainer initialState={data.state} client={data.client} legacyInvitationToken="historical-link-token" arrivalScope={LEGACY_SCOPE} />, { wrapper: Providers });
    await sendSubmission();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE));
    expect(data.client.submit).toHaveBeenCalledWith(TRIBE_SLUG, expect.objectContaining({ legacyInvitationToken: "historical-link-token" }), expect.any(AbortSignal));
    expect(storedIntent(LEGACY_SCOPE)).toBeNull();
    expectNothingUncertain();
  });
});
