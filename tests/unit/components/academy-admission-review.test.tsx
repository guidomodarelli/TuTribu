/** Exercises real React/beez-ui/Motion review interactions with doubles only of the owned client port. @module academy-admission-review-tests */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionReviewRouteContainer } from "@/app/(platform)/[slug]/academia/admissions/admission-review-route-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

const requestId = "2b71737c-2f11-4dbb-853d-080bda9628e5", operationId = "a86a3f18-a48e-4600-a057-f90e1931f7b0";
const viewerId = "synthetic-reviewer", slug = "synthetic-academy";
const router = { back: vi.fn(), bfcacheId: "admission-review-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses actual production providers and the framework's real router context. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** Provides only own public reviewer data and transport outcomes. */
function fixture(selected = true) {
  const request: AdmissionReviewDto = { id: requestId, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2026-11-06T01:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [], applicant: { id: "synthetic-applicant", name: "Solicitante sintético" }, rawContact: "applicant@example.test", contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" }, evidence: { kind: "declared" }, eligibleActions: ["reject", "approve"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null }, applicantMessage: "Quiero participar." };
  const state: Extract<AdmissionReviewPageState, { kind: "ready" }> = { kind: "ready", viewerId, slug, renderedAt: "2026-10-07T01:00:00Z", page: { items: [request], nextCursor: null }, selected: selected ? request : null };
  const client = {
    viewer: vi.fn<AdmissionReviewBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    reviewList: vi.fn<AdmissionReviewBrowserClient["reviewList"]>(async () => ({ status: "ready", value: { items: [request], nextCursor: null } })),
    reviewDetail: vi.fn<AdmissionReviewBrowserClient["reviewDetail"]>(async () => ({ status: "ready", value: request })),
    operation: vi.fn<AdmissionReviewBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    decide: vi.fn<AdmissionReviewBrowserClient["decide"]>(async () => ({ status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } })),
  };
  return { request, state, client, node: <AdmissionReviewRouteContainer initialState={state} client={client} /> };
}

/** Enables only after the native viewer/current detail reads have settled. */
async function confirmDecision() {
  await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
  fireEvent.change(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason), { target: { value: "Revisión manual registrada" } });
  fireEvent.change(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.externalMessage), { target: { value: "Tu ingreso fue aprobado." } });
  fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("native reviewer container", () => {
  it("should recover a terminal decision denial, retain reviewer reason and pending resource without another mutation or completion feedback", async () => {
    const data = fixture();
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Razón conservada", externalMessage: "" } });
    data.client.operation.mockResolvedValue({ status: "ready", value: { type: "decide_admission_request", state: "completed", operationId, replayed: true, result: { outcome: "denied", code: "request_conflict", admissionRequestId: requestId } } });
    render(data.node, { wrapper: Providers });
    expect(await screen.findByText("La solicitud cambió. Revisala antes de confirmar.")).toBeInTheDocument();
    await waitFor(() => expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull());
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toHaveValue("Razón conservada");
    expect(screen.queryByText(ADMISSION_REVIEW_UI_COPY.recovered)).not.toBeInTheDocument();
    expect(data.client.decide).not.toHaveBeenCalled(); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("should replace the selected resource when the same route receives another exact request snapshot", async () => {
    const data = fixture(), secondRequestId = "ef5a843a-2a11-412a-8235-0bd765831723";
    data.client.reviewDetail.mockImplementation(async (_slug, id) => ({ status: "ready", value: { ...data.request, id, applicant: { ...data.request.applicant, name: id === secondRequestId ? "Otra solicitud" : data.request.applicant.name } } }));
    const view = render(data.node, { wrapper: Providers }); await confirmDecision();
    const second = { ...data.request, id: secondRequestId, applicant: { ...data.request.applicant, name: "Otra solicitud" } };
    view.rerender(<AdmissionReviewRouteContainer initialState={{ ...data.state, selected: second }} client={data.client} />);
    await screen.findByRole("heading", { name: "Otra solicitud" });
    expect(data.client.reviewDetail).toHaveBeenLastCalledWith(slug, secondRequestId, expect.any(AbortSignal));
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toHaveValue("");
  });

  it("should abort a pending POST on pageshow and hide private detail until the native viewer is revalidated", async () => {
    const data = fixture(); let resolveWrite!: (value: Awaited<ReturnType<AdmissionReviewBrowserClient["decide"]>>) => void;
    data.client.decide.mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await waitFor(() => expect(data.client.decide).toHaveBeenCalledTimes(1));
    const signal = data.client.decide.mock.calls[0][3];
    data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: "another-account" } });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(signal.aborted).toBe(true);
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.changedViewer);
    expect(screen.queryByText("applicant@example.test")).not.toBeInTheDocument();
    await act(async () => resolveWrite({ status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } }));
    expect(data.client.decide).toHaveBeenCalledTimes(1);
  });

  it("should keep an ordinary initial pageshow from aborting a pending decision", async () => {
    const data = fixture(); let resolveWrite!: (value: Awaited<ReturnType<AdmissionReviewBrowserClient["decide"]>>) => void;
    data.client.decide.mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await waitFor(() => expect(data.client.decide).toHaveBeenCalledTimes(1));
    const signal = data.client.decide.mock.calls[0][3];
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: false }));
    expect(signal.aborted).toBe(false);
    await act(async () => resolveWrite({ status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    expect(data.client.operation).not.toHaveBeenCalled();
  });

  it("should navigate from the oldest-first inbox, validate explicit confirmation and apply one minimal decision without a route refresh", async () => {
    const data = fixture(false); render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar solicitud: Solicitante sintético" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Revisar solicitud: Solicitante sintético" }));
    await confirmDecision();
    expect(screen.getByText(ADMISSION_REVIEW_UI_COPY.declared)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    expect(data.client.decide).toHaveBeenCalledTimes(1);
    expect(data.client.decide).toHaveBeenCalledWith(slug, requestId, expect.objectContaining({ expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Revisión manual registrada", externalMessage: "Tu ingreso fue aprobado." }), expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
  });

  it("should disable a decision without a reason and explicit confirmation before calling the writer", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeDisabled();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should reconcile a lost decision response by the original GET without sending another POST", async () => {
    const data = fixture();
    data.client.decide.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la decisión.", uncertain: true });
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.uncertain);
    const original = data.client.decide.mock.calls[0][2];
    expect(readAdmissionReviewIntent(viewerId, slug)?.input).toEqual(original);
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "decide_admission_request", state: "completed", operationId: original.operationId, replayed: true, result: { admissionRequestId: requestId, version: 2, status: "approved" } } });
    data.client.reviewDetail.mockResolvedValueOnce({ status: "ready", value: { ...data.request, version: 2, status: "approved", eligibleActions: [] } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.recovered);
    expect(data.client.operation).toHaveBeenCalledWith(slug, original.operationId, expect.any(AbortSignal));
    expect(data.client.decide).toHaveBeenCalledTimes(1);
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
  });

  it("should retry only after genuine original absence and keep the exact body and UUID", async () => {
    const data = fixture();
    data.client.decide.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar la decisión.", uncertain: true });
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.uncertain);
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    expect(data.client.decide).toHaveBeenCalledTimes(2);
    expect(data.client.decide.mock.calls[1][2]).toEqual(data.client.decide.mock.calls[0][2]);
  });

  it("should keep an actually started operation read-only and restore its draft after reload", async () => {
    const data = fixture();
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Motivo original", externalMessage: "Mensaje original" } });
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "decide_admission_request", state: "started", operationId } });
    render(data.node, { wrapper: Providers });
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.uncertain);
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toHaveValue("Motivo original");
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.retry })).not.toBeInTheDocument();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should hide all previous-account private facts and skip reads/writes when native viewer changes", async () => {
    const data = fixture(); data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: "another-account" } });
    render(data.node, { wrapper: Providers }); await screen.findByText(ADMISSION_REVIEW_UI_COPY.changedViewer);
    expect(screen.queryByText("applicant@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("Quiero participar.")).not.toBeInTheDocument();
    expect(data.client.reviewList).not.toHaveBeenCalled();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should restore the original intent through manual recovery after a failed native session read", async () => {
    const data = fixture();
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Motivo original" } });
    data.client.viewer.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "Fallo de lectura", uncertain: false });
    render(data.node, { wrapper: Providers }); await screen.findByText(ADMISSION_REVIEW_UI_COPY.readFailed);
    expect(screen.queryByText("applicant@example.test")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.uncertain);
    expect(data.client.operation).toHaveBeenCalledWith(slug, operationId, expect.any(AbortSignal));
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should clear private detail and block decisions after current reviewer permissions are revoked", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers }); await confirmDecision();
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "Ya no podés revisar solicitudes.", uncertain: false });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    await screen.findByText("Ya no podés revisar solicitudes.");
    expect(screen.queryByText("applicant@example.test")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should preserve an aborted Activity write and reconcile it after reactivation without a second POST", async () => {
    const data = fixture(); let resolveWrite!: (value: Awaited<ReturnType<AdmissionReviewBrowserClient["decide"]>>) => void;
    data.client.decide.mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await waitFor(() => expect(data.client.decide).toHaveBeenCalledTimes(1));
    const original = data.client.decide.mock.calls[0][2], signal = data.client.decide.mock.calls[0][3];
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    expect(signal.aborted).toBe(true);
    data.client.operation.mockResolvedValueOnce({ status: "ready", value: { type: "decide_admission_request", state: "completed", operationId: original.operationId, replayed: true, result: { admissionRequestId: requestId, status: "approved", version: 2 } } });
    data.client.reviewDetail.mockResolvedValueOnce({ status: "ready", value: { ...data.request, status: "approved", version: 2, eligibleActions: [] } });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.recovered);
    await act(async () => resolveWrite({ status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } }));
    expect(data.client.decide).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
