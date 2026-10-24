/** Exercises explicit batch decisions through the real reviewer route and @golfo/ui. @module academy-admissions-batch-tests */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionReviewRouteContainer } from "@/app/(platform)/[slug]/academia/admissions/admission-review-route-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionBatchResultDto, AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

type BatchInput = Parameters<AdmissionReviewBrowserClient["decideBatch"]>[1];
const viewerId = "synthetic-batch-reviewer", slug = "batch-review";
const router = { back: vi.fn(), bfcacheId: "batch-review", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Real UI and framework contexts. @returns The production provider tree. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** @param index - Synthetic row identity. @returns One genuine public pending review projection. */
function request(index: number): AdmissionReviewDto {
  return { id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, status: "pending", version: 1, submittedAt: "2026-10-16T12:00:00Z", expiresAt: "2100-11-16T12:00:00Z", source: "common", needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], applicant: { id: `synthetic-batch-applicant-${index}`, name: `Persona ${index + 1}` }, rawContact: `persona${index + 1}@example.test`, contact: { type: "email", maskedValue: "p•••@example.test", evidenceKind: "declared" }, evidence: { kind: "declared" }, eligibleActions: ["approve", "reject"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null } };
}

/** @param count - Visible initial rows. @returns The actual route input and doubles of its owned transport only. */
function fixture(count = 2) {
  const items = Array.from({ length: count }, (_, index) => request(index));
  const state: Extract<AdmissionReviewPageState, { kind: "ready" }> = { kind: "ready", viewerId, slug, renderedAt: "2026-10-16T12:00:00Z", filters: { ...DEFAULT_ADMISSION_REVIEW_SELECTION, limit: 50 }, page: { items, nextCursor: null }, selected: null };
  const client = {
    viewer: vi.fn<AdmissionReviewBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    reviewList: vi.fn<AdmissionReviewBrowserClient["reviewList"]>(async () => ({ status: "ready", value: state.page })),
    reviewDetail: vi.fn<AdmissionReviewBrowserClient["reviewDetail"]>(async () => ({ status: "ready", value: items[0] })),
    operation: vi.fn<AdmissionReviewBrowserClient["operation"]>(), decide: vi.fn<AdmissionReviewBrowserClient["decide"]>(),
    decideBatch: vi.fn<(slug: string, input: BatchInput, signal: AbortSignal) => Promise<AdmissionBrowserResult<AdmissionBatchResultDto>>>(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, state: "completed", result: "all_succeeded", completedCount: input.items.length, failedCount: 0, unresolvedCount: 0, items: input.items.map((item) => ({ requestId: item.requestId, status: "approved", version: item.expectedVersion + 1, safeMessage: "Solicitud aprobada." })) } })),
  };
  return { items, state, client, node: <AdmissionReviewRouteContainer initialState={state} client={client} /> };
}

/** @returns A genuine scoped local original after its POST response was lost and the document was reloaded. */
function restoredFixture() {
  const data = fixture(), operationId = "8e2d6cf5-9a21-4bd8-8471-18e865397d08";
  writeAdmissionReviewIntent(viewerId, slug, { kind: "decide_admission_requests_batch", selection: data.items.map((item) => ({ requestId: item.id, expectedVersion: item.version, applicantName: item.applicant.name })), input: { operationId, confirmed: true, decision: "approve", internalReason: "Revisión conservada antes de recargar" } });
  data.state.page.items = [];
  data.client.operation.mockResolvedValue({ status: "ready", value: { type: "decide_admission_requests_batch", operationId, state: "completed", replayed: true, result: { results: data.items.map((item) => ({ admissionRequestId: item.id, status: "approved", version: 2 })) } } });
  return { ...data, operationId };
}

/** @param names - Explicit visible names. @returns After the user has reviewed and confirmed that named selection. */
async function confirmBatch(names = ["Persona 1", "Persona 2"]) {
  for (const name of names) {
    const checkbox = await screen.findByRole("checkbox", { name: `Seleccionar solicitud de ${name}` });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
  }
  const form = screen.getByRole("region", { name: "Decidir solicitudes seleccionadas" });
  for (const name of names) await waitFor(() => expect(within(form).getByText(name)).toBeVisible());
  fireEvent.change(within(form).getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason), { target: { value: "Revisión explícita del lote" } });
  fireEvent.click(within(form).getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" }));
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("explicit reviewer batch decisions", () => {
  it("should show the recovered original after reload when the following list read fails", async () => {
    const data = restoredFixture();
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar las solicitudes actuales.", uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    const results = screen.getByRole("region", { name: "Resultados del lote" });
    expect(within(results).getByText("Persona 1")).toBeVisible();
    expect(within(results).getByText("Persona 2")).toBeVisible();
    expect(within(results).getAllByText("Solicitud aprobada.")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar las solicitudes actuales.");
    expect(data.client.decideBatch).not.toHaveBeenCalled();
    expect(data.client.operation).toHaveBeenCalledExactlyOnceWith(slug, data.operationId, expect.any(AbortSignal));
  });

  it("should hide recovered names when the following list read rejects current authorization", async () => {
    const data = restoredFixture();
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para revisar las solicitudes.", uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    expect(screen.queryByRole("region", { name: "Resultados del lote" })).not.toBeInTheDocument();
    expect(screen.queryByText("Persona 1")).not.toBeInTheDocument();
    expect(screen.getByText("No tenés permiso para revisar las solicitudes.")).toBeVisible();
    expect(data.client.decideBatch).not.toHaveBeenCalled();
  });

  it.each(["operation", "selection", "version", "namespace"])("should retain the unresolved local original when recovery substitutes its %s", async (variant) => {
    const data = restoredFixture(), otherId = "4dcd702f-0d79-4df2-b24c-23b8384974a0";
    const results = data.items.map((item, index) => ({ admissionRequestId: variant === "selection" && index === 0 ? otherId : item.id, status: "approved" as const, version: variant === "version" ? 3 : 2 }));
    data.client.operation.mockResolvedValue({ status: "ready", value: variant === "namespace" ? { type: ADMISSION_OPERATION_TYPE.decide, operationId: data.operationId, state: "completed", replayed: true, result: { admissionRequestId: data.items[0].id, status: "approved", version: 2 } } : { type: "decide_admission_requests_batch", operationId: variant === "operation" ? otherId : data.operationId, state: "completed", replayed: true, result: { results } } });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    expect(screen.queryByRole("region", { name: "Resultados del lote" })).not.toBeInTheDocument();
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
    expect(data.client.reviewList).not.toHaveBeenCalled();
    expect(data.client.decideBatch).not.toHaveBeenCalled();
  });

  it("should submit only the named visible selection when the user confirms a batch", async () => {
    // Given three visible requests and an explicit selection of two.
    const data = fixture(3);
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    // When the reviewer submits the confirmed decision.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    // Then one bounded original excludes the third row and updates incrementally.
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
    expect(data.client.decideBatch.mock.calls[0][1]).toMatchObject({ confirmed: true, decision: "approve", internalReason: "Revisión explícita del lote", items: data.items.slice(0, 2).map((item) => ({ requestId: item.id, expectedVersion: 1 })) });
    expect(data.client.decide).not.toHaveBeenCalled();
    const results = screen.getByRole("region", { name: "Resultados del lote" });
    expect(within(results).getByText("Persona 1")).toBeVisible();
    expect(within(results).getByText("Persona 2")).toBeVisible();
    expect(within(results).queryByText("Persona 3")).not.toBeInTheDocument();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep the pressed batch decision busy while its write is pending and disable every other write", async () => {
    const data = fixture(); let resolveWrite!: (value: AdmissionBrowserResult<AdmissionBatchResultDto>) => void;
    data.client.decideBatch.mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" }));
    await waitFor(() => expect(data.client.decideBatch).toHaveBeenCalledTimes(1));
    // The pressed decision keeps its label and announces progress; the alternative decision and the current read stay disabled.
    expect(screen.getByRole("button", { name: "Aprobar seleccionadas" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Rechazar seleccionadas" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consultar estado actual" })).toBeDisabled();
    expect(screen.queryByText("El resultado del lote no está confirmado. Consultá la operación original antes de volver a intentar.")).not.toBeInTheDocument();
    const input = data.client.decideBatch.mock.calls[0][1];
    await act(async () => resolveWrite({ status: "ready", value: { operationId: input.operationId, state: "completed", result: "all_succeeded", completedCount: input.items.length, failedCount: 0, unresolvedCount: 0, items: input.items.map((item) => ({ requestId: item.requestId, status: "approved", version: item.expectedVersion + 1, safeMessage: "Solicitud aprobada." })) } }));
    expect(screen.getByRole("region", { name: "Resultados del lote" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aprobar seleccionadas" })).not.toBeInTheDocument();
  });

  it("should retain confirmed mixed row outcomes when a later list read fails", async () => {
    // Given an approved row and a confirmed conflict in the same original.
    const data = fixture();
    data.client.decideBatch.mockImplementation(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [{ requestId: data.items[0].id, status: "approved", version: 2, safeMessage: "Solicitud aprobada." }, { requestId: data.items[1].id, status: "conflict", code: "request_conflict", safeMessage: "La solicitud cambió. Consultá su estado actual." }] } }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    // When a subsequent refresh cannot retrieve the list.
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar las solicitudes.", uncertain: false });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    // Then terminal per-row results remain available without repeating either decision.
    const results = screen.getByRole("region", { name: "Resultados del lote" });
    expect(within(results).getByText("Solicitud aprobada.")).toBeVisible();
    expect(within(results).getByText("La solicitud cambió. Consultá su estado actual.")).toBeVisible();
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
    expect(data.client.operation).not.toHaveBeenCalled();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
  });

  it("should recover the exact batch without another POST when its response was lost", async () => {
    // Given a persisted original whose initial response could not be confirmed.
    const data = fixture();
    data.client.decideBatch.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el resultado del lote.", uncertain: true });
    data.client.operation.mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "decide_admission_requests_batch", operationId, state: "completed", replayed: true, result: { results: data.items.map((item) => ({ admissionRequestId: item.id, status: "approved", version: 2 })) } } }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
    // When the reviewer explicitly consults that original.
    data.client.reviewList.mockResolvedValue({ status: "ready", value: { items: [], nextCursor: null } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    // Then both confirmed results survive and the immutable operation is not resent.
    const results = screen.getByRole("region", { name: "Resultados del lote" });
    expect(within(results).getAllByText("Solicitud aprobada.")).toHaveLength(2);
    expect(data.client.operation).toHaveBeenCalledWith(slug, data.client.decideBatch.mock.calls[0][1].operationId, expect.any(AbortSignal));
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve a second uncertain original after dismissing a completed mixed batch", async () => {
    const data = fixture(4);
    data.client.decideBatch.mockImplementationOnce(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, state: "completed", result: "mixed", completedCount: 1, failedCount: 1, unresolvedCount: 0, items: [{ requestId: data.items[0].id, status: "approved", version: 2, safeMessage: "Solicitud aprobada." }, { requestId: data.items[1].id, status: "conflict", code: "request_conflict", safeMessage: "La solicitud cambió." }] } }));
    data.client.decideBatch.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el resultado.", uncertain: true });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar resultados" }));
    data.state.page.items = data.items.slice(2);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    await confirmBatch(["Persona 3", "Persona 4"]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    expect(data.client.decideBatch).toHaveBeenCalledTimes(2);
    expect(data.client.decideBatch.mock.calls[1][1].items).toEqual(data.items.slice(2).map((item) => ({ requestId: item.id, expectedVersion: 1 })));
    expect(screen.getByText("El resultado del lote no está confirmado. Consultá la operación original antes de volver a intentar.")).toBeVisible();
    expect(readAdmissionReviewIntent(viewerId, slug)).toMatchObject({ kind: "decide_admission_requests_batch", input: { operationId: data.client.decideBatch.mock.calls[1][1].operationId } });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should enforce fifty explicitly visible rows when another loaded page contains more candidates", async () => {
    const data = fixture(50), extra = request(50);
    data.state.page.nextCursor = "next-owned-page";
    data.client.reviewList.mockResolvedValue({ status: "ready", value: { items: [extra], nextCursor: null } });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Seleccionar solicitud de Persona 1" })).toBeEnabled());
    for (const item of data.items) fireEvent.click(screen.getByRole("checkbox", { name: `Seleccionar solicitud de ${item.applicant.name}` }));
    expect(data.client.reviewList).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ver más solicitudes" })));
    const last = screen.getByRole("checkbox", { name: "Seleccionar solicitud de Persona 51" });
    expect(last).toBeDisabled();
    expect(screen.getByText("Llegaste al máximo de solicitudes por lote. Quitá una para elegir otra.")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar solicitud de Persona 1" }));
    expect(last).toBeEnabled();
    fireEvent.click(last);
    const form = screen.getByRole("region", { name: "Decidir solicitudes seleccionadas" });
    expect(within(form).getByText("Persona 51")).toBeVisible();
    expect(within(form).queryByText("Persona 1")).not.toBeInTheDocument();
    expect(data.client.decideBatch).not.toHaveBeenCalled();
    expect(data.client.viewer).toHaveBeenCalledTimes(4);
  });

  it("should stop recovery after a terminal all-rejected original without retrying its rows", async () => {
    const data = fixture();
    data.client.decideBatch.mockImplementation(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, state: "completed", result: "all_rejected", completedCount: 0, failedCount: 2, unresolvedCount: 0, items: data.items.map((item) => ({ requestId: item.id, status: "conflict", code: "request_conflict", safeMessage: "La solicitud cambió." })) } }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    expect(screen.getByText("No se aplicaron decisiones del lote. Revisá el resultado de cada solicitud.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reintentar el mismo lote" })).not.toBeInTheDocument();
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    expect(data.client.operation).not.toHaveBeenCalled();
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
  });

  it("should retry the same unresolved original only after an absent operation and renewed confirmation", async () => {
    const data = fixture();
    data.client.decideBatch.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos confirmar el resultado.", uncertain: true });
    data.client.operation.mockResolvedValueOnce({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    const original = structuredClone(data.client.decideBatch.mock.calls[0][1]);
    expect(screen.queryByRole("button", { name: "Reintentar el mismo lote" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    const retry = screen.getByRole("button", { name: "Reintentar el mismo lote" });
    expect(retry).toBeDisabled();
    const form = screen.getByRole("region", { name: "Decidir solicitudes seleccionadas" });
    expect(within(form).getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toBeDisabled();
    fireEvent.click(within(form).getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" }));
    let resolveRetry!: (value: AdmissionBrowserResult<AdmissionBatchResultDto>) => void;
    data.client.decideBatch.mockImplementationOnce(async () => new Promise((resolve) => { resolveRetry = resolve; }));
    fireEvent.click(retry);
    await waitFor(() => expect(data.client.decideBatch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Reintentar el mismo lote" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Consultar estado actual" })).toBeDisabled();
    const replayed = data.client.decideBatch.mock.calls[1][1];
    await act(async () => resolveRetry({ status: "ready", value: { operationId: replayed.operationId, state: "completed", result: "all_succeeded", completedCount: replayed.items.length, failedCount: 0, unresolvedCount: 0, items: replayed.items.map((item) => ({ requestId: item.requestId, status: "approved", version: item.expectedVersion + 1, safeMessage: "Solicitud aprobada." })) } }));
    expect(data.client.decideBatch).toHaveBeenCalledTimes(2);
    expect(data.client.decideBatch.mock.calls[1][1]).toEqual(original);
    expect(readAdmissionReviewIntent(viewerId, slug)).toBeNull();
  });

  it("should retain an aborted original for recovery when the reviewer leaves during its POST", async () => {
    const data = fixture();
    let settle!: (result: AdmissionBrowserResult<AdmissionBatchResultDto>) => void;
    data.client.decideBatch.mockImplementationOnce(async () => new Promise((resolve) => { settle = resolve; }));
    const view = render(data.node, { wrapper: Providers });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    const original = data.client.decideBatch.mock.calls[0][1];
    view.unmount();
    expect(data.client.decideBatch.mock.calls[0][2].aborted).toBe(true);
    await act(async () => settle({ status: "ready", value: { operationId: original.operationId, state: "completed", result: "all_succeeded", completedCount: 2, failedCount: 0, unresolvedCount: 0, items: data.items.map((item) => ({ requestId: item.id, status: "approved", version: 2, safeMessage: "Solicitud aprobada." })) } }));
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
  });

  it("should hide the original manifest when the native account changes after a batch response", async () => {
    const data = fixture();
    let currentViewer = viewerId;
    data.client.viewer.mockImplementation(async () => ({ status: "ready", value: { id: currentViewer } }));
    data.client.decideBatch.mockImplementation(async (_slug, input) => {
      currentViewer = "different-synthetic-reviewer";
      return { status: "ready", value: { operationId: input.operationId, state: "completed", result: "all_succeeded", completedCount: 2, failedCount: 0, unresolvedCount: 0, items: data.items.map((item) => ({ requestId: item.id, status: "approved", version: 2, safeMessage: "Solicitud aprobada." })) } };
    });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    expect(screen.getByText("La cuenta cambió. Recargá la página para consultar la bandeja de esta cuenta.")).toBeVisible();
    expect(screen.queryByText("Persona 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resultados del lote" })).not.toBeInTheDocument();
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
    expect(readAdmissionReviewIntent(currentViewer, slug)).toBeNull();
  });
});

describe("visible batch selection freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // JSDOM cannot produce a foreground browser; the real listeners and React workflow stay active.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  it("should preserve drafts, confirmation and focus when the current visible selection is unchanged", async () => {
    const data = fixture();
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    const form = screen.getByRole("region", { name: "Decidir solicitudes seleccionadas" }), reason = within(form).getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason);
    act(() => reason.focus());
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(reason).toHaveValue("Revisión explícita del lote");
    expect(reason).toHaveFocus();
    expect(within(form).getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" })).toBeChecked();
    expect(data.client.reviewList).toHaveBeenCalledTimes(1);
    expect(data.client.decideBatch).not.toHaveBeenCalled();
  });

  it("should require a new explicit selection when a changed name later returns to its old text", async () => {
    const data = fixture();
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    data.client.reviewList.mockResolvedValueOnce({ status: "ready", value: { items: [{ ...data.items[0], applicant: { ...data.items[0].applicant, name: "Nombre actualizado" } }, data.items[1]], nextCursor: null } });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole("checkbox", { name: "Seleccionar solicitud de Nombre actualizado" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" })).not.toBeChecked();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole("checkbox", { name: "Seleccionar solicitud de Persona 1" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Confirmo esta decisión sobre todas las solicitudes enumeradas" })).not.toBeChecked();
    expect(data.client.decideBatch).not.toHaveBeenCalled();
  });

  it("should consult registered progress without enabling another POST while the batch remains started", async () => {
    const data = fixture();
    data.client.decideBatch.mockImplementation(async (_slug, input) => ({ status: "ready", value: { operationId: input.operationId, state: "started", result: "incomplete", completedCount: 0, failedCount: 0, unresolvedCount: 2, items: data.items.map((item) => ({ requestId: item.id, status: "unresolved", code: "operation_unresolved", safeMessage: "Sin resolución confirmada." })) } }));
    data.client.operation.mockImplementation(async (_slug, operationId) => ({ status: "ready", value: { type: "decide_admission_requests_batch", operationId, state: "started" } }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await confirmBatch();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Aprobar seleccionadas" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Consultar estado actual" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
    expect(screen.queryByRole("button", { name: "Reintentar el mismo lote" })).not.toBeInTheDocument();
    expect(data.client.operation).toHaveBeenCalledTimes(1);
    expect(data.client.decideBatch).toHaveBeenCalledTimes(1);
    expect(readAdmissionReviewIntent(viewerId, slug)).not.toBeNull();
  });
});
