/** Exercises real React, beez-ui, Motion and hydration with only owned transport ports replaced. @module academy-admissions-manual-tests */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { Activity, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionContainer } from "@/app/(admission)/admissions/[slug]/admission-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionDraftKey, readAdmissionDraft, writeAdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { RequestStatus } from "@/components/academy-admissions/request-status";

const VIEWER_ID = "synthetic-manual-viewer";
const REQUEST_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const OPERATION_ID = "20ca5bf6-8517-4e0d-a7d7-24144fcb0ea8";
const router = { back: vi.fn(), bfcacheId: "admission-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses the production UI provider and real native router context, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

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

  it.each(["admitted", "already_member"] as const)("should expose academy navigation only after the owner confirms %s and current own access is reconciled", async (outcome) => {
    const data = fixture();
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "available", nextAction: "request_admission" } });
    vi.mocked(data.client.submit).mockImplementation(async (_slug, input) => {
      vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: { ...data.state.overview, state: "already_member", nextAction: "open_academy", safeMessage: "Ya formás parte de la academia." } });
      return { status: "ready", value: { operationId: input.operationId, outcome, membership: { role: "tribemate", status: "active" }, safeMessage: "Podés abrir la academia." } };
    });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: ADMISSION_UI_COPY.message }), { target: { value: "Mensaje que se conserva" } });
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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
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
    expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeDisabled();
  });

  it("should reload an original intent stored by another document before restoring a bfcache page", async () => {
    const data = fixture();
    vi.mocked(data.client.own).mockResolvedValue({ status: "ready", value: null });
    vi.mocked(data.client.overview).mockResolvedValue({ status: "ready", value: data.state.overview });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "submit_admission", state: "started", operationId: OPERATION_ID } });
    render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
    writeAdmissionDraft({ viewerId: VIEWER_ID, slug: "synthetic-academy", draft: { phone: "", country: "", message: "Intent conservado por otra página" }, pending: { kind: "submit", input: { operationId: OPERATION_ID, expectedPolicyVersion: 1, confirmed: true, message: "Intent conservado por otra página" } } });
    fireEvent(window, Object.assign(new Event("pageshow"), { persisted: true }));
    await waitFor(() => expect(data.client.operation).toHaveBeenCalledWith("synthetic-academy", OPERATION_ID, expect.any(AbortSignal)));
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Solicitar ingreso" })).toBeDisabled();
    expect(data.client.submit).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(admissionDraftKey(VIEWER_ID, "synthetic-academy"))!).pending.input.operationId).toBe(OPERATION_ID);
  });

  it("should recover a retained write after Activity reactivates with a temporary viewer failure", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockImplementation(() => new Promise(() => {}));
    const content = (mode: "visible" | "hidden") => <Activity mode={mode}><AdmissionContainer initialState={data.state} client={data.client} /></Activity>;
    const view = render(content("visible"), { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
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
    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).not.toBeInTheDocument());
    expect(data.client.cancel).toHaveBeenCalledWith("synthetic-academy", REQUEST_ID, expect.objectContaining({ expectedVersion: 1, confirmed: true }), expect.any(AbortSignal));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should abort on unmount and preserve the original write for later reconciliation", async () => {
    const data = fixture();
    vi.mocked(data.client.submit).mockImplementation(async () => new Promise(() => {}));
    const view = render(<AdmissionContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_UI_COPY.confirm })).toBeEnabled());
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
