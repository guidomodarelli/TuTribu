/** The applicant's page offers a retry only for a failure that can pass and shows each error next to what produced it. @module academy-admission-applicant-recovery-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemedToaster, toast } from "@golfo/ui";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import { LegacyAdmissionContainer } from "@/app/(admission)/admissions/[slug]/legacy/[token]/legacy-admission-container";
import { AdmissionScreen } from "@/components/academy-admissions/admission-screen";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_REQUEST_FLOW_COPY } from "@/src/modules/academy-admissions/constants/admission-request-flow";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { LEGACY_ADMISSION_COPY } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";

const VIEWER_ID = "synthetic-recovery-viewer";
const REQUEST_ID = "7a4d8b2f-3c5e-4d9f-8a21-2b3c4d5e6f70";
const TRIBE_SLUG = "synthetic-academy";
const router = { back: vi.fn(), bfcacheId: "admission-recovery-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** Real framework and UI providers, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}<ThemedToaster /></AppUIProvider></AppRouterContext.Provider>; }
// Sonner replays every active toast to a newly mounted toaster; dismissing them keeps each test's toasts its own.
afterEach(() => { toast.dismiss(); sessionStorage.clear(); });

/** Lets the mount effects finish their asynchronous checks inside `act`. */
async function settleEffects() { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); }); }

/** @param code - Why the server snapshot could not be read. @returns The page state the server renders for it. */
function unavailable(code: AdmissionErrorCode): AdmissionPageState { return { kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] }; }

/** @param code - A rejection that repeats until the applicant changes something. @returns A definitive failure of one write. */
function definitiveFailure(code: AdmissionErrorCode) { return { status: "failed" as const, code, message: ADMISSION_ERROR_MESSAGE[code], uncertain: false }; }

/** Supplies the application's own current-state and transport contracts for one applicant. */
function fixture() {
  const request: AdmissionRequestDto & { status: "pending" } = { id: REQUEST_ID, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2100-11-06T01:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" } };
  const state: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId: VIEWER_ID, renderedAt: "2026-10-07T01:00:00Z", request: null, overview: { tribe: { slug: TRIBE_SLUG, name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "available", nextAction: "request_admission", safeMessage: "Podés solicitar ingreso." } };
  const client: AdmissionBrowserClient = {
    viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: VIEWER_ID } })),
    overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: state.overview })),
    own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: state.request })),
    operation: vi.fn<AdmissionBrowserClient["operation"]>(async () => ({ status: "failed", code: ADMISSION_ERROR_CODE.resourceUnavailable, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.resourceUnavailable], uncertain: false })),
    submit: vi.fn<AdmissionBrowserClient["submit"]>(async () => definitiveFailure(ADMISSION_ERROR_CODE.policyConflict)),
    cancel: vi.fn<AdmissionBrowserClient["cancel"]>(async () => definitiveFailure(ADMISSION_ERROR_CODE.requestConflict)),
  };
  return { state, request, client };
}

describe("applicant page that could not be read", () => {
  it.each([ADMISSION_ERROR_CODE.dependencyUnavailable, ADMISSION_ERROR_CODE.unexpectedFailure, ADMISSION_ERROR_CODE.publicContractUnusable])("should offer a retry that reads the page again, keeping the way home, for %s", (code) => {
    const retry = vi.fn();
    render(<AdmissionScreen state={unavailable(code)} onRetryUnavailable={retry} />, { wrapper: Providers });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_ERROR_MESSAGE[code]);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.retryUnavailable }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: ADMISSION_UI_COPY.home })).toBeVisible();
  });

  it.each([ADMISSION_ERROR_CODE.permissionDenied, ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable, ADMISSION_ERROR_CODE.authenticationRequired])("should not offer a retry that cannot help for %s", (code) => {
    render(<AdmissionScreen state={unavailable(code)} onRetryUnavailable={vi.fn()} />, { wrapper: Providers });

    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_ERROR_MESSAGE[code]);
    expect(screen.queryByRole("button", { name: ADMISSION_UI_COPY.retryUnavailable })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: ADMISSION_UI_COPY.home })).toBeVisible();
  });

  it("should wire the retry on the entry and the own request page", async () => {
    const { unmount } = render(<AdmissionContainer initialState={unavailable(ADMISSION_ERROR_CODE.dependencyUnavailable)} client={fixture().client} />, { wrapper: Providers });
    await settleEffects();
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.retryUnavailable })).toBeEnabled();
    unmount();

    render(<AdmissionContainer initialState={unavailable(ADMISSION_ERROR_CODE.transportTimeout)} client={fixture().client} requestPage />, { wrapper: Providers });
    await settleEffects();
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.retryUnavailable })).toBeEnabled();
  });
});

describe("applicant errors next to what produced them", () => {
  it("should show a refused submission once, in the submission step, and clear it when the applicant changes the confirmation", async () => {
    const data = fixture();
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));

    const message = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.policyConflict];
    const flow = screen.getByRole("form", { name: ADMISSION_REQUEST_FLOW_COPY.submitLabel });
    await waitFor(() => expect(within(flow).getByRole("alert")).toHaveTextContent(message));
    expect(screen.getAllByText(message)).toHaveLength(1);

    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
  });

  it("should show a refused cancellation once, next to the cancel action, and clear it when the applicant changes the confirmation", async () => {
    const data = fixture(); data.state.request = data.request; data.state.overview = { ...data.state.overview, state: "pending", nextAction: "view_request", request: data.request };
    render(<AdmissionContainer initialState={data.state} client={data.client} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.cancel }));

    const message = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.requestConflict];
    const status = screen.getByRole("region", { name: "Estado de tu solicitud" });
    await waitFor(() => expect(within(status).getByRole("alert")).toHaveTextContent(message));
    expect(screen.getAllByText(message)).toHaveLength(1);

    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
  });

  it("should show a refused WhatsApp correction once, in its own form, and clear it when the applicant edits the number", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview = { ...data.state.overview, state: "pending", nextAction: "view_request", request: own };
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: own });
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async () => definitiveFailure(ADMISSION_ERROR_CODE.requestConflict));
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));

    const message = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.requestConflict];
    await waitFor(() => expect(within(screen.getByRole("form", { name: ADMISSION_WHATSAPP_COPY.editTitle })).getByRole("alert")).toHaveTextContent(message));
    expect(screen.getAllByText(message)).toHaveLength(1);

    await waitFor(() => expect(screen.getByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel }), { target: { value: "+44 20 7946 0018" } });
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});

describe("historical admission link with a malformed token", () => {
  it("should explain the link cannot work and offer a way out instead of a retry", async () => {
    render(<PathParamsContext.Provider value={{ slug: TRIBE_SLUG, token: "not-a-canonical-token" }}><LegacyAdmissionContainer initialState={unavailable(ADMISSION_ERROR_CODE.invalidInput)} /></PathParamsContext.Provider>, { wrapper: Providers });
    await settleEffects();

    expect(screen.getByRole("alert")).toHaveTextContent(LEGACY_ADMISSION_COPY.invalidLink);
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: ADMISSION_UI_COPY.home })).toBeVisible();
  });
});
