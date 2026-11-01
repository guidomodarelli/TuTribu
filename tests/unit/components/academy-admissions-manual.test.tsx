/** Exercises real React, @golfo/ui, Motion and hydration with only owned transport ports replaced. @module academy-admissions-manual-tests */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { Activity, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemedToaster, toast } from "@golfo/ui";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import { AdmissionScreen } from "@/components/academy-admissions/admission-screen";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionAccountBrowserClient, AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { ADMISSION_OVERVIEW_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-overview";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionDraftKey, readAdmissionDraft, writeAdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { RequestStatus } from "@/components/academy-admissions/request-status";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";

const VIEWER_ID = "synthetic-manual-viewer";
const REQUEST_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OPERATION_ID = "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8";
const router = { back: vi.fn(), bfcacheId: "admission-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses the production UI provider and real native router context, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}<ThemedToaster /></AppUIProvider></AppRouterContext.Provider>; }
// Sonner replays every active toast to a newly mounted toaster; dismissing them keeps each test's toasts its own.
afterEach(() => { toast.dismiss(); });

/** @returns After the applicant's data step is ready. */
async function dataStepReady() { await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled()); }
/** @returns On the submission step, after the data step hands over. */
async function toSubmission() { await dataStepReady(); fireEvent.click(screen.getByRole("button", { name: "Continuar" })); await screen.findByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }); }

/** Supplies the application's own current-state and transport contracts. */
function fixture() {
  const request: AdmissionRequestDto & { status: "pending" } = { id: REQUEST_ID, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2100-11-06T01:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" } };
  const state: Extract<AdmissionPageState, { kind: "ready" }> = { kind: "ready", viewerId: VIEWER_ID, renderedAt: "2026-10-07T01:00:00Z", request: null, overview: { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: { mode: "manual_review", contactType: "email", requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "available", nextAction: "request_admission", safeMessage: "Podés solicitar ingreso." } };
  const client: AdmissionBrowserClient = {
    viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: VIEWER_ID } })),
    overview: vi.fn<AdmissionBrowserClient["overview"]>(async () => ({ status: "ready", value: { ...state.overview, state: "pending", nextAction: "view_request", request } })),
    own: vi.fn<AdmissionBrowserClient["own"]>(async () => ({ status: "ready", value: request })),
    operation: vi.fn<AdmissionBrowserClient["operation"]>(async () => ({ status: "ready", value: { type: "submit_admission", state: "completed", replayed: true, operationId: OPERATION_ID, result: { operationId: OPERATION_ID, outcome: "pending", admissionRequestId: REQUEST_ID, committedRequestVersion: 1, membership: null, created: true, requestSnapshot: request } } })),
    submit: vi.fn<AdmissionBrowserClient["submit"]>(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, outcome: "pending", request, safeMessage: "La solicitud quedó pendiente de revisión." } })),
    cancel: vi.fn<AdmissionBrowserClient["cancel"]>(async () => ({ status: "ready", value: { admissionRequestId: REQUEST_ID, version: 2, status: "cancelled" } })),
  };
  return { state, request, client };
}

describe("manual admission screen", () => {
  beforeEach(() => { sessionStorage.clear(); router.refresh.mockClear(); });

  it.each([false, true])("should conceal a retained private WhatsApp on Activity reactivation for pending=%s until the account is validated", async (isPending) => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    if (isPending) { data.state.request = own; data.state.overview.state = "pending"; }
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview }); vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: isPending ? own : null });
    const content = (mode: "hidden" | "visible") => <Activity mode={mode}><AdmissionContainer initialState={data.state} client={data.client} /></Activity>, view = render(content("visible"));
    const input = await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel });
    if (!isPending) fireEvent.change(input, { target: { value: own.whatsappNumber } });
    view.rerender(content("hidden"));
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: ADMISSION_UI_COPY.readFailed, uncertain: false });
    view.rerender(content("visible"));
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    expect(screen.queryByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).not.toBeInTheDocument();
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.client.cancel).not.toHaveBeenCalled();
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: VIEWER_ID } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read }));
    expect(await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).toHaveValue(own.whatsappNumber);
  });
  it("should validate and save an own pending correction without changing the admission contact or refreshing the route", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: null, requiresWhatsappNumber: true };
    data.state.request = own; data.state.overview.state = "pending";
    vi.mocked(data.client.own).mockImplementation(async () => ({ status: "ready", value: own }));
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async (_slug, _requestId, input) => {
      Object.assign(own, { whatsappNumber: input.whatsappNumber, version: 2 });
      return { status: "ready", value: { admissionRequestId: REQUEST_ID, version: 2, changed: true } };
    });
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    const input = await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.label });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));
    expect(await screen.findByText(ADMISSION_WHATSAPP_COPY.required)).toBeVisible();
    expect(updateWhatsappNumber).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "+1 (415) 555-2671" } });
    expect(screen.queryByText(ADMISSION_WHATSAPP_COPY.required)).not.toBeInTheDocument();
    expect(confirmation).not.toBeChecked();
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));
    expect(await screen.findByText(ADMISSION_WHATSAPP_COPY.saved)).toBeVisible();
    await waitFor(() => expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.pending).toBeNull());
    expect(updateWhatsappNumber).toHaveBeenCalledExactlyOnceWith("synthetic-academy", REQUEST_ID, { operationId: expect.any(String), expectedVersion: 1, confirmed: true, whatsappNumber: "+14155552671" }, expect.any(AbortSignal));
    expect(own.contact).toEqual(data.request.contact); expect(own.submittedAt).toBe(data.request.submittedAt); expect(own.expiresAt).toBe(data.request.expiresAt);
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.client.cancel).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain an exact lost correction and recover it without another POST or route refresh", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview.state = "pending";
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async () => ({ status: "failed", code: "dependency_unavailable", message: ADMISSION_WHATSAPP_COPY.uncertain, uncertain: true }));
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel }), { target: { value: "" } });
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));
    await screen.findByText(ADMISSION_WHATSAPP_COPY.uncertain);
    const original = readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.pending;
    expect(original).toMatchObject({ kind: "whatsapp", requestId: REQUEST_ID, input: { expectedVersion: 1, whatsappNumber: null, confirmed: true } });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "update_admission_whatsapp", operationId: original!.input.operationId, state: "completed", replayed: true, result: { admissionRequestId: REQUEST_ID, version: 2, changed: true } } });
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: { ...own, whatsappNumber: null, version: 2 } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read }));
    expect(await screen.findByText(ADMISSION_WHATSAPP_COPY.saved)).toBeVisible();
    await waitFor(() => expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.pending).toBeNull());
    expect(updateWhatsappNumber).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should require a new confirmation after a current request version changes while preserving the proposed number", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview.state = "pending";
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async () => ({ status: "ready", value: { admissionRequestId: REQUEST_ID, version: 3, changed: true } }));
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    const input = screen.getByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel });
    fireEvent.change(input, { target: { value: "+44 20 7946 0018" } }); fireEvent.click(confirmation);
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: { ...own, whatsappNumber: null, version: 2 } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read }));
    await waitFor(() => expect(confirmation).not.toBeChecked());
    await waitFor(() => expect(confirmation).toBeEnabled());
    expect(input).toHaveValue("+44 20 7946 0018"); expect(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save })).toBeDisabled();
    expect(updateWhatsappNumber).not.toHaveBeenCalled();
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));
    await waitFor(() => expect(updateWhatsappNumber).toHaveBeenCalledOnce());
    expect(updateWhatsappNumber.mock.calls[0][2]).toMatchObject({ expectedVersion: 2, whatsappNumber: "+442079460018" });
  });

  it("should preserve an unresolved correction and hide private data when the account changes before its reply is consumed", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview.state = "pending";
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>(async () => {
      vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: "another-native-viewer" } });
      return { status: "ready", value: { admissionRequestId: REQUEST_ID, version: 1, changed: false } };
    });
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    const confirmation = await screen.findByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.confirmEdit });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: ADMISSION_WHATSAPP_COPY.save }));
    await screen.findByText(ADMISSION_UI_COPY.accountChanged);
    expect(screen.queryByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(ADMISSION_WHATSAPP_COPY.unchanged)).not.toBeInTheDocument();
    expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.pending?.kind).toBe("whatsapp");
    expect(updateWhatsappNumber).toHaveBeenCalledOnce(); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("should hide the private declared number until the native account is revalidated after a bfcache restore", async () => {
    const data = fixture(), own = { ...data.request, whatsappNumber: "+14155552671", requiresWhatsappNumber: false };
    data.state.request = own; data.state.overview.state = "pending";
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: own });
    const updateWhatsappNumber = vi.fn<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>();
    render(<AdmissionContainer initialState={data.state} client={data.client} whatsappClient={{ updateWhatsappNumber }} requestPage />, { wrapper: Providers });
    expect(await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).toHaveValue(own.whatsappNumber);
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: ADMISSION_UI_COPY.readFailed, uncertain: false });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    expect(screen.queryByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(own.whatsappNumber, { exact: false })).not.toBeInTheDocument();
    expect(updateWhatsappNumber).not.toHaveBeenCalled();
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: VIEWER_ID } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read }));
    expect(await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).toHaveValue(own.whatsappNumber);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should conceal the common WhatsApp draft on a failed restored account check and preserve it for the same account", async () => {
    const data = fixture();
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview }); vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    fireEvent.change(await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel }), { target: { value: "+14155552671" } });
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: ADMISSION_UI_COPY.readFailed, uncertain: false });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    expect(screen.queryByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).not.toBeInTheDocument();
    expect(data.client.submit).not.toHaveBeenCalled();
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: VIEWER_ID } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.read }));
    expect(await screen.findByRole("textbox", { name: ADMISSION_WHATSAPP_COPY.optionalLabel })).toHaveValue("+14155552671");
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should validate declared WhatsApp before a required common submission and keep it separate from account contact", async () => {
    const data = fixture(); data.state.overview.policy!.requiresWhatsappNumber = true;
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const input = await screen.findByRole("textbox", { name: "Teléfono" });
    expect(input).toBeRequired();
    // The data step explains why it cannot continue until the number is valid.
    expect(await screen.findByText(ADMISSION_WHATSAPP_COPY.required)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "invalid" } });
    expect(screen.queryByText(ADMISSION_WHATSAPP_COPY.required)).not.toBeInTheDocument();
    expect(await screen.findByText("Ingresá un teléfono válido con el prefijo del país.")).toBeVisible();
    fireEvent.change(input, { target: { value: "+1 (415) 555-2671" } });
    expect(screen.queryByText("Ingresá un teléfono válido con el prefijo del país.")).not.toBeInTheDocument();
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledOnce());
    const command = vi.mocked(data.client.submit).mock.calls[0][1];
    expect(command).toMatchObject({ whatsappNumber: "+14155552671", expectedPolicyVersion: 1 });
    expect(command).not.toHaveProperty("phone"); expect(command).not.toHaveProperty("proofId");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should ask a single phone and no separate group number when the contact is a phone", async () => {
    const data = fixture(); data.state.overview.policy!.contactType = "phone"; data.state.overview.policy!.requiresWhatsappNumber = true;
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await dataStepReady();
    expect(screen.getAllByRole("textbox", { name: ADMISSION_UI_COPY.phone })).toHaveLength(1);
    expect(screen.queryByText(ADMISSION_WHATSAPP_COPY.required)).not.toBeInTheDocument();
  });

  it("should leave declared WhatsApp optional by default and reuse the Google name without new name fields", async () => {
    const data = fixture();
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    expect(await screen.findByRole("textbox", { name: "Teléfono (opcional)" })).not.toBeRequired();
    expect(screen.queryByRole("textbox", { name: /^(Nombre|Apellido)$/i })).not.toBeInTheDocument();
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledOnce());
    expect(vi.mocked(data.client.submit).mock.calls[0][1]).not.toHaveProperty("whatsappNumber");
  });

  it("should preserve a source-scoped original while adding historical URL material only to the explicit transport", async () => {
    const data = fixture(), arrivalScope = "b".repeat(64), token = "synthetic-historical-arrival";
    vi.mocked(data.client.submit).mockResolvedValueOnce({ status: "failed", code: "unexpected_failure", message: "La respuesta no quedó confirmada.", uncertain: true });
    render(<AdmissionContainer initialState={data.state} client={data.client} legacyInvitationToken={token} arrivalScope={arrivalScope} />, { wrapper: Providers });
    await toSubmission();
    expect(data.client.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledTimes(1));
    expect(vi.mocked(data.client.submit).mock.calls[0][1].legacyInvitationToken).toBe(token);
    const stored = readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug, arrivalScope);
    expect(stored?.pending?.kind).toBe("submit");
    expect(JSON.stringify(stored).includes(token)).toBe(false);
    expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)).toBeNull();
    expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug, "c".repeat(64))).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it.each([
    ["admission_closed", "Por ahora esta solicitud no puede aprobarse porque las admisiones no están disponibles. Su plazo sigue corriendo."],
    ["allowlist_requirement_unmet", "Actualmente no se cumple la lista exigida para esta solicitud. Consultá al equipo de la academia."],
    ["invitation_recipient_unproven", "El contacto de esta invitación necesita una comprobación vigente antes de que puedan aprobarla."],
  ] as const)("should explain current pending reason %s and clear it after a current query", (reason, message) => {
    const data = fixture();
    const props = { request: { ...data.request, eligibilityReasons: [reason] }, now: "2026-10-07T02:00:00Z", confirmed: false, disabled: false, busy: false, errorMessage: null, onConfirm: vi.fn(), onCancel: vi.fn() };
    const rendered = render(<RequestStatus {...props} />, { wrapper: Providers });
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel })).toBeEnabled();
    rendered.rerender(<RequestStatus {...props} request={{ ...data.request, eligibilityReasons: [] }} />);
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("La solicitud está pendiente de revisión.");
  });

  it("should recover a terminal submission denial, preserve the explanation and clear only the original intent without another POST or success message", async () => {
    const data = fixture(), message = "No pudimos usar ese contacto para el ingreso. Revisá tu cuenta o pedí ayuda.";
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "completed", replayed: true, operationId: OPERATION_ID, result: { outcome: "denied", code: "contact_binding_conflict", admissionRequestId: null } } });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview });
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: data.state.overview.tribe.slug, draft: { phone: "", country: "", message: "Conservá mi explicación." }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true, message: "Conservá mi explicación." } } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.pending).toBeNull());
    expect(readAdmissionDraft(VIEWER_ID, data.state.overview.tribe.slug)?.draft.message).toBe("Conservá mi explicación.");
    expect(data.client.submit).not.toHaveBeenCalled(); expect(data.client.cancel).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: ADMISSION_UI_COPY.openAcademy })).not.toBeInTheDocument();
  });

  it("should replace the form with the list notice and an account change when the own email cannot meet the list", async () => {
    const data = fixture(), changeAccount = vi.fn<AdmissionAccountBrowserClient["changeAccount"]>(async () => ({ status: "failed", code: "dependency_unavailable", message: ADMISSION_ERROR_MESSAGE.dependency_unavailable, uncertain: false }));
    data.state.overview = { ...data.state.overview, policy: { ...data.state.overview.policy!, mode: "allowlist" }, state: "closed", nextAction: "change_account", safeMessage: ADMISSION_OVERVIEW_MESSAGE.allowlistOnly };
    render(<AdmissionContainer initialState={data.state} client={data.client} accountClient={{ changeAccount }} />, { wrapper: Providers });
    expect(screen.getByText(ADMISSION_OVERVIEW_MESSAGE.allowlistOnly)).toBeVisible();
    const change = screen.getByRole("button", { name: ADMISSION_UI_COPY.changeAccount });
    await waitFor(() => expect(change).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).not.toBeInTheDocument();
    fireEvent.click(change);
    expect(await screen.findByText(ADMISSION_ERROR_MESSAGE.dependency_unavailable)).toBeVisible();
    expect(changeAccount).toHaveBeenCalledOnce();
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should keep every action disabled while the page leaves after a confirmed sign-out", async () => {
    const data = fixture(), changeAccount = vi.fn<AdmissionAccountBrowserClient["changeAccount"]>(async () => ({ status: "ready", value: null }));
    data.state.overview = { ...data.state.overview, policy: { ...data.state.overview.policy!, mode: "allowlist" }, state: "closed", nextAction: "change_account", safeMessage: ADMISSION_OVERVIEW_MESSAGE.allowlistOnly };
    render(<AdmissionContainer initialState={data.state} client={data.client} accountClient={{ changeAccount }} />, { wrapper: Providers });
    const change = screen.getByRole("button", { name: ADMISSION_UI_COPY.changeAccount });
    await waitFor(() => expect(change).toBeEnabled());
    fireEvent.click(change);
    await waitFor(() => expect(changeAccount).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.changingAccount })).toBeDisabled();
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.read })).toBeDisabled();
    expect(screen.queryByText(ADMISSION_UI_COPY.accountChanged)).not.toBeInTheDocument();
  });

  it("should not offer an account change that cannot run while an original stays unresolved", () => {
    const data = fixture();
    data.state.overview = { ...data.state.overview, policy: { ...data.state.overview.policy!, mode: "allowlist" }, state: "closed", nextAction: "change_account", safeMessage: ADMISSION_OVERVIEW_MESSAGE.allowlistOnly };
    render(<AdmissionScreen state={data.state} phase="uncertain" formReady onChangeAccount={vi.fn()} />, { wrapper: Providers });
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.changeAccount })).toBeDisabled();
  });

  it("should show the list notice instead of the generic refusal when a submission meets a list that no longer admits this account", async () => {
    const data = fixture(), notice = { ...data.state.overview, policy: { ...data.state.overview.policy!, mode: "allowlist" as const }, state: "closed" as const, nextAction: "change_account" as const, safeMessage: ADMISSION_OVERVIEW_MESSAGE.allowlistOnly };
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    vi.mocked(data.client.submit).mockImplementation(async () => {
      vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: notice });
      return { status: "failed", code: "admission_ineligible", message: ADMISSION_ERROR_MESSAGE.admission_ineligible, uncertain: false };
    });
    render(<AdmissionContainer initialState={data.state} client={data.client} accountClient={{ changeAccount: vi.fn() }} />, { wrapper: Providers });
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
    expect(await screen.findByText(ADMISSION_OVERVIEW_MESSAGE.allowlistOnly)).toBeVisible();
    expect(screen.getByRole("button", { name: ADMISSION_UI_COPY.changeAccount })).toBeVisible();
    expect(screen.queryByText(ADMISSION_ERROR_MESSAGE.admission_ineligible)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).not.toBeInTheDocument();
    expect(data.client.submit).toHaveBeenCalledOnce();
  });

  it.each(["admitted", "already_member"] as const)("should expose academy navigation only after the owner confirms %s and current own access is reconciled", async (outcome) => {
    const data = fixture();
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "available", nextAction: "request_admission" } });
    vi.mocked(data.client.submit).mockImplementation(async (_slug, input) => {
      vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "already_member", nextAction: "open_academy", safeMessage: "Ya formás parte de la academia." } });
      return { status: "ready", value: { operationId: input.operationId, outcome, membership: { role: "tribemate", status: "active" }, safeMessage: "Podés abrir la academia." } };
    });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await toSubmission();
    expect(screen.queryByRole("link", { name: ADMISSION_UI_COPY.openAcademy })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_UI_COPY.submit }));
    expect(await screen.findByRole("link", { name: ADMISSION_UI_COPY.openAcademy })).toHaveAttribute("href", "/synthetic-academy/academia");
    expect(data.client.submit).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should require confirmation, avoid mount effects and permit only one pending submission across double clicks", async () => {
    const data = fixture();
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalledOnce());
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(data.client.own).not.toHaveBeenCalled();
    await toSubmission();
    expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeEnabled());
    const submit = screen.getByRole("button", { name: "Solicitar ingreso" });
    fireEvent.click(submit); fireEvent.click(submit);
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.submit).toHaveBeenCalledOnce();
    expect(data.client.submit).toHaveBeenCalledWith("synthetic-academy", expect.objectContaining({ confirmed: true, expectedPolicyVersion: 1, operationId: expect.any(String) }), expect.any(AbortSignal));
    expect(screen.queryByRole("link", { name: "Abrir academia" })).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should retain an ambiguous original body and recover after restoration without repeating its POST", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos completar la operación.", uncertain: true });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await dataStepReady();
    fireEvent.change(screen.getByRole("textbox", { name: ADMISSION_UI_COPY.message }), { target: { value: "Mensaje que se conserva" } });
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar ingreso" }));
    await screen.findByText(ADMISSION_UI_COPY.uncertain);
    const original = vi.mocked(data.client.submit).mock.calls[0][1];
    expect(original.message).toBe("Mensaje que se conserva");
    const record = JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!);
    expect(record.pending.input).toEqual(original);
    vi.mocked(data.client.operation).mockResolvedValueOnce({ status: "ready", value: { type: "submit_admission", state: "completed", operationId: original.operationId, replayed: true, result: { operationId: original.operationId, outcome: "pending", admissionRequestId: REQUEST_ID, committedRequestVersion: 1, membership: null, created: true, requestSnapshot: data.request } } });
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.operation).toHaveBeenCalledWith("synthetic-academy", original.operationId, expect.any(AbortSignal));
    expect(data.client.submit).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should restore only an owned draft, clear confirmation and reconcile an existing intent before any write", async () => {
    const data = fixture();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Borrador previo" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true, message: "Borrador previo" } } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.operation).toHaveBeenCalledOnce();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending).toBeNull();
  });

  it("should require an original registry read before retrying exactly the same ambiguous body", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos completar la operación.", uncertain: true });
    vi.mocked(data.client.operation).mockResolvedValueOnce({ status: "failed", code: "resource_unavailable", message: "No pudimos encontrar esta operación.", uncertain: false });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: "Solicitar ingreso" }));
    await screen.findByText(ADMISSION_UI_COPY.uncertain);
    expect(screen.queryByRole("button", { name: ADMISSION_UI_COPY.retryOriginal })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    const retry = await screen.findByRole("button", { name: ADMISSION_UI_COPY.retryOriginal });
    fireEvent.click(retry);
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.operation).toHaveBeenCalledOnce();
    expect(data.client.submit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(data.client.submit).mock.calls[1][1]).toEqual(vi.mocked(data.client.submit).mock.calls[0][1]);
  });

  it("should keep registered started work in read-only recovery and not permit another POST", async () => {
    const data = fixture();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByText(ADMISSION_UI_COPY.uncertain);
    expect(screen.queryByRole("button", { name: ADMISSION_UI_COPY.retryOriginal })).not.toBeInTheDocument();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("should reload an original intent stored by another document before restoring a bfcache page", async () => {
    const data = fixture();
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await dataStepReady();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Intent conservado por otra página" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true, message: "Intent conservado por otra página" } } });
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledWith("synthetic-academy", OPERATION_ID, expect.any(AbortSignal)));
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(OPERATION_ID);
  });

  it("should hide the previous account's own state when its UID changes while recovery waits", async () => {
    const data = fixture();
    data.state.request = data.request;
    data.state.overview.state = "pending";
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Borrador propio" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    let resolveOperation!: (value: Awaited<ReturnType<AdmissionBrowserClient["operation"]>>) => void;
    vi.mocked(data.client.operation).mockImplementation(() => new Promise((resolve) => { resolveOperation = resolve; }));
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledOnce());
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: { id: "another-native-viewer" } });
    await act(async () => resolveOperation({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } }));
    await screen.findByText(ADMISSION_UI_COPY.accountChanged);
    expect(screen.queryByText("a•••@example.test", { exact: false })).not.toBeInTheDocument();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(OPERATION_ID);
  });

  it("should keep the visible request confirmation labelled correctly when another request tree is retained hidden", () => {
    const data = fixture(), onConfirm = vi.fn();
    render(<Providers><Activity mode="hidden"><RequestStatus request={data.request} now={data.state.renderedAt} confirmed={false} disabled={false} busy={false} errorMessage={null} onConfirm={() => {}} onCancel={() => {}} /></Activity><RequestStatus request={data.request} now={data.state.renderedAt} confirmed={false} disabled={false} busy={false} errorMessage={null} onConfirm={onConfirm} onCancel={() => {}} /></Providers>);
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("should explain revoked contact evidence for the existing pending request and clear that feedback after rechecking", () => {
    const data = fixture(); data.request.needsVerification = true; data.request.eligibilityReasons = ["evidence_revoked"];
    const props = { now: data.state.renderedAt, confirmed: false, disabled: false, busy: false, errorMessage: null, onConfirm: () => {}, onCancel: () => {} };
    const { rerender } = render(<Providers><RequestStatus request={data.request} {...props} /></Providers>);
    expect(screen.getByText("La prueba de contacto de esta solicitud fue revocada. Necesitás comprobar el contacto nuevamente para que puedan aprobarla.")).toBeVisible();
    expect(screen.queryByText("Esta academia requiere comprobar el contacto antes de presentar una solicitud.")).not.toBeInTheDocument();
    rerender(<Providers><RequestStatus request={{ ...data.request, needsVerification: false, eligibilityReasons: [] }} {...props} /></Providers>);
    expect(screen.queryByText(/La prueba de contacto de esta solicitud fue revocada/)).not.toBeInTheDocument();
  });

  it("should keep recovery callable after a temporary viewer failure at the end of an operation read", async () => {
    const data = fixture();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "ready", value: { id: VIEWER_ID } }).mockResolvedValueOnce({ status: "ready", value: { id: VIEWER_ID } }).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la cuenta.", uncertain: false });
    vi.mocked(data.client.operation).mockResolvedValueOnce({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar estado" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should load stored intent before any new action when the initial viewer read failed", async () => {
    const data = fixture();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Borrador conservado" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la cuenta.", uncertain: false });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview });
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledWith("synthetic-academy", OPERATION_ID, expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(OPERATION_ID);
  });

  it("should recover a retained write after Activity reactivates with a temporary viewer failure", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockImplementation(() => new Promise(() => {}));
    const content = (mode: "visible" | "hidden") => <Activity mode={mode}><AdmissionContainer initialState={data.state} client={data.client} /></Activity>;
    const view = render(content("visible"), { wrapper: Providers });
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: "Solicitar ingreso" }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledOnce());
    const original = vi.mocked(data.client.submit).mock.calls[0][1], signal = vi.mocked(data.client.submit).mock.calls[0][2];
    view.rerender(content("hidden"));
    expect(signal.aborted).toBe(true);
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la cuenta.", uncertain: false });
    view.rerender(content("visible"));
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar estado" })).toBeEnabled());
    vi.mocked(data.client.operation).mockResolvedValueOnce({ status: "ready", value: { type: "submit_admission", state: "completed", operationId: original.operationId, replayed: true, result: { operationId: original.operationId, outcome: "pending", admissionRequestId: REQUEST_ID, committedRequestVersion: 1, membership: null, created: true, requestSnapshot: data.request } } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await screen.findByText("La solicitud está pendiente de revisión.");
    expect(data.client.submit).toHaveBeenCalledOnce();
  });

  it("should invalidate a loaded draft before a failed viewer check on bfcache restoration", async () => {
    const data = fixture();
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview });
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await dataStepReady();
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Intent de otra página" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la cuenta.", uncertain: false });
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await screen.findByText(ADMISSION_UI_COPY.readFailed);
    expect(screen.getByRole("textbox", { name: ADMISSION_UI_COPY.message })).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(OPERATION_ID);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledWith("synthetic-academy", OPERATION_ID, expect.any(AbortSignal)));
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should retain a newer own version when recovering a historical pending result", async () => {
    const data = fixture();
    const current = { ...data.request, status: "approved" as const, version: 3 };
    data.state.request = current;
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: current });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "already_member", nextAction: "open_academy", request: current } });
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true } } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByRole("link", { name: "Abrir academia" });
    expect(screen.getByText("Tu solicitud fue aprobada.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).not.toBeInTheDocument();
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should hide old own state and block actions when the native account changes", async () => {
    const data = fixture();
    data.state.request = data.request;
    data.state.overview.state = "pending";
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "ready", value: { id: "another-native-viewer" } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await screen.findByText(ADMISSION_UI_COPY.accountChanged);
    expect(screen.queryByText("a•••@example.test", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).not.toBeInTheDocument();
    expect(data.client.cancel).not.toHaveBeenCalled();
    expect(data.client.submit).not.toHaveBeenCalled();
  });

  it("should cancel explicitly using the original own version and keep terminal state without refreshing the route", async () => {
    const data = fixture();
    data.state.request = data.request;
    data.state.overview.state = "pending";
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: { ...data.request, status: "cancelled", version: 2, retryAllowedAt: "2100-11-07T01:00:00Z" } });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "closed", nextAction: "wait", safeMessage: "Todavía no podés volver a presentar." } });
    render(<AdmissionContainer initialState={data.state} requestPage client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel })).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar solicitud" })).toBeEnabled());
    const cancellationButton = screen.getByRole("button", { name: "Cancelar solicitud" });
    act(() => cancellationButton.focus());
    expect(cancellationButton).toHaveFocus();
    fireEvent.click(cancellationButton);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).not.toBeInTheDocument());
    expect(data.client.cancel).toHaveBeenCalledWith("synthetic-academy", REQUEST_ID, expect.objectContaining({ expectedVersion: 1, confirmed: true }), expect.any(AbortSignal));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Estado de tu solicitud" })).getByText(ADMISSION_UI_COPY.cancelled, { exact: true })).toHaveFocus();
  });

  it("should preserve a different focused control when cancellation completes asynchronously", async () => {
    const data = fixture(); data.state.request = data.request; data.state.overview.state = "pending";
    const response = Promise.withResolvers<Awaited<ReturnType<AdmissionBrowserClient["cancel"]>>>();
    vi.mocked(data.client.cancel).mockImplementation(() => response.promise);
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: { ...data.request, status: "cancelled", version: 2 } });
    render(<AdmissionContainer initialState={data.state} requestPage client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel })).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirmCancel }));
    const cancellationButton = screen.getByRole("button", { name: ADMISSION_UI_COPY.cancel });
    act(() => cancellationButton.focus()); fireEvent.click(cancellationButton);
    await waitFor(() => expect(data.client.cancel).toHaveBeenCalledOnce());
    const home = screen.getByRole("link", { name: ADMISSION_UI_COPY.home });
    act(() => home.focus());
    await act(async () => response.resolve({ status: "ready", value: { admissionRequestId: REQUEST_ID, version: 2, status: "cancelled" } }));
    await waitFor(() => expect(screen.queryByRole("button", { name: ADMISSION_UI_COPY.cancel })).not.toBeInTheDocument());
    expect(home).toHaveFocus(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should abort on unmount and preserve the original write for later reconciliation", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockImplementation(async () => new Promise(() => {}));
    const view = render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await toSubmission();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Solicitar ingreso" }));
    await waitFor(() => expect(data.client.submit).toHaveBeenCalledOnce());
    const signal = vi.mocked(data.client.submit).mock.calls[0][2];
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(vi.mocked(data.client.submit).mock.calls[0][1].operationId);
  });

  it("should hydrate the same initial snapshot and expose safe login return without mutation", async () => {
    const data = fixture();
    data.state.viewerId = null;
    data.state.overview.state = "sign_in_required";
    data.state.overview.nextAction = "sign_in";
    vi.mocked(data.client.viewer).mockResolvedValue({ status: "ready", value: null });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Providers><AdmissionContainer initialState={data.state} client={data.client} /></Providers>);
    document.body.append(container);
    const errors: unknown[] = [];
    const root = hydrateRoot(container, <Providers><AdmissionContainer initialState={data.state} client={data.client} /></Providers>, { onRecoverableError: (error) => errors.push(error) });
    await act(async () => { await Promise.resolve(); });
    expect(errors).toEqual([]);
    expect(container.querySelector('a[href*="/auth/signin?"]')?.getAttribute("href")).toBe("/auth/signin?callbackUrl=%2Fadmissions%2Fsynthetic-academy");
    expect(data.client.submit).not.toHaveBeenCalled();
    await act(async () => root.unmount()); container.remove();
  });
});
