/** Exercises real React/beez-ui/Motion review interactions with doubles only of the owned client port. @module academy-admission-review-tests */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionReviewRouteContainer } from "@/app/(platform)/[slug]/academia/admissions/admission-review-route-container";
import { NotificationCenter } from "@/app/(platform)/notification-center";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import type { AdmissionReviewPageState } from "@/src/modules/academy-admissions/application/results/admission-review-page-state";
import type { AdmissionReviewDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { readAdmissionReviewIntent, writeAdmissionReviewIntent } from "@/lib/academy-admissions/admission-review-intent";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_REVIEW_FILTER_COPY } from "@/src/modules/academy-admissions/constants/admission-review-filters";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

const requestId = "2b71737c-2f11-4dbb-853d-080bda9628e5", operationId = "a86a3f18-a48e-4600-a057-f90e1931f7b0";
const viewerId = "synthetic-reviewer", slug = "synthetic-academy";
const router = { back: vi.fn(), bfcacheId: "admission-review-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** Uses actual production providers and the framework's real router context. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** Provides only own public reviewer data and transport outcomes. */
function fixture(selected = true) {
  const request: AdmissionReviewDto = { id: requestId, status: "pending", version: 1, submittedAt: "2026-10-07T01:00:00Z", expiresAt: "2026-11-06T01:00:00Z", source: "common", needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], applicant: { id: "synthetic-applicant", name: "Solicitante sintético" }, rawContact: "applicant@example.test", contact: { type: "email", maskedValue: "a•••@example.test", evidenceKind: "declared" }, evidence: { kind: "declared" }, eligibleActions: ["reject", "approve"], restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null }, applicantMessage: "Quiero participar." };
  const state: Extract<AdmissionReviewPageState, { kind: "ready" }> = { kind: "ready", viewerId, slug, renderedAt: "2026-10-07T01:00:00Z", filters: DEFAULT_ADMISSION_REVIEW_SELECTION, page: { items: [request], nextCursor: null }, selected: selected ? request : null };
  const client = {
    viewer: vi.fn<AdmissionReviewBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })),
    reviewList: vi.fn<AdmissionReviewBrowserClient["reviewList"]>(async () => ({ status: "ready", value: { items: [request], nextCursor: null } })),
    reviewDetail: vi.fn<AdmissionReviewBrowserClient["reviewDetail"]>(async () => ({ status: "ready", value: request })),
    operation: vi.fn<AdmissionReviewBrowserClient["operation"]>(async () => ({ status: "failed", code: "resource_unavailable", message: "La operación no está disponible.", uncertain: false })),
    decide: vi.fn<AdmissionReviewBrowserClient["decide"]>(async () => ({ status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } })),
    decideBatch: vi.fn<AdmissionReviewBrowserClient["decideBatch"]>(),
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

describe("visible reviewer inbox refresh", () => {
  it("should show the account name and declared group number without claiming group verification or changing evidence", () => {
    const data = fixture();
    data.request.whatsappNumber = "+14155552671"; data.request.requiresWhatsappNumber = true;
    render(data.node, { wrapper: Providers });
    expect(screen.getAllByText(data.request.applicant.name).length).toBeGreaterThan(0);
    expect(screen.getByText(data.request.whatsappNumber)).toBeVisible();
    expect(screen.getByText(ADMISSION_WHATSAPP_COPY.declared)).toBeVisible();
    expect(data.request.evidence.kind).toBe("declared"); expect(data.client.decide).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    // JSDOM has no foreground tab; real events, React and cancellation remain in use.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each([false, true])("should reconcile the server age highlight in the visible inbox or detail %s without another timer or route refresh", async (selected) => {
    const data = fixture(selected);
    const highlighted = { ...data.request, pendingAgeThresholdReached: true };
    data.client.reviewList.mockResolvedValueOnce({ status: "ready", value: { items: [highlighted], nextCursor: null } });
    data.client.reviewDetail.mockResolvedValueOnce({ status: "ready", value: highlighted });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    expect(screen.queryByText("Pendiente hace tres días o más")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("Pendiente hace tres días o más")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.queryByText("Pendiente hace tres días o más")).not.toBeInTheDocument();
    expect(data.client.reviewList).toHaveBeenCalledTimes(2);
    expect(data.client.reviewDetail).toHaveBeenCalledTimes(selected ? 2 : 0);
    expect(data.client.decide).not.toHaveBeenCalled();
    expect(data.client.decideBatch).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should show a newly available pending request after fifteen seconds without refreshing the route", async () => {
    const data = fixture(false);
    const incoming = { ...data.request, id: "02d6f9d4-f47a-4eb6-bbae-7a82b7c3dace", applicant: { id: "synthetic-new-applicant", name: "Nueva persona solicitante" } };
    data.client.reviewList.mockResolvedValue({ status: "ready", value: { items: [incoming, data.request], nextCursor: null } });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    expect(screen.queryByText("Nueva persona solicitante")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("Nueva persona solicitante")).toBeVisible();
    expect(data.client.decide).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve decision drafts, confirmation and focus during an equal background snapshot", async () => {
    const data = fixture();
    await act(async () => { render(data.node, { wrapper: Providers }); });
    const reason = screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason);
    fireEvent.change(reason, { target: { value: "Motivo que todavía estoy editando" } });
    fireEvent.change(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.externalMessage), { target: { value: "Mensaje conservado" } });
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
    act(() => reason.focus());
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(data.client.reviewList).toHaveBeenCalledTimes(1);
    expect(reason).toHaveValue("Motivo que todavía estoy editando");
    expect(reason).toHaveFocus();
    expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeChecked();
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.externalMessage)).toHaveValue("Mensaje conservado");
  });

  it("should reconcile every previously loaded page while keeping the current selection policy", async () => {
    const data = fixture(false);
    const older = { ...data.request, id: "47af84ef-717b-4be5-9613-f72aa6da295d", applicant: { id: "synthetic-older-applicant", name: "Persona de la segunda página" } };
    data.state.filters = { ...DEFAULT_ADMISSION_REVIEW_SELECTION, limit: 1 };
    data.state.page.nextCursor = "own-second-page";
    let refreshed = false;
    data.client.reviewList.mockImplementation(async (_slug, cursor) => ({ status: "ready", value: cursor ? { items: [older], nextCursor: null } : { items: [{ ...data.request, applicant: { ...data.request.applicant, name: refreshed ? "Nombre actualizado" : data.request.applicant.name } }], nextCursor: "own-second-page" } }));
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.loadMore })));
    expect(screen.getByText("Persona de la segunda página")).toBeVisible();
    refreshed = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("Nombre actualizado")).toBeVisible();
    expect(screen.getByText("Persona de la segunda página")).toBeVisible();
    expect(data.client.reviewList.mock.calls.at(-1)?.[3]).toEqual(data.state.filters);
  });

  it("should clear an earlier manual read failure after a successful automatic refresh", async () => {
    const data = fixture();
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: ADMISSION_REVIEW_UI_COPY.readFailed, uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read })));
    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_REVIEW_UI_COPY.readFailed);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(data.client.reviewList).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toBeEnabled();
  });

  it("should clear a polling failure after a successful manual current read", async () => {
    const data = fixture();
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: ADMISSION_REVIEW_UI_COPY.readFailed, uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_REVIEW_UI_COPY.readFailed);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read })));
    expect(data.client.reviewList).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toBeEnabled();
  });

  it("should reconcile the open real notification center as soon as an original decision is recovered while private review data remains hidden", async () => {
    const data = fixture();
    const original = Promise.withResolvers<Awaited<ReturnType<AdmissionReviewBrowserClient["operation"]>>>();
    const currentPage = Promise.withResolvers<Awaited<ReturnType<AdmissionReviewBrowserClient["reviewList"]>>>();
    data.client.operation.mockImplementation(() => original.promise);
    data.client.reviewList.mockImplementation(() => currentPage.promise);
    data.client.reviewDetail.mockResolvedValue({ status: "ready", value: { ...data.request, status: "approved", version: 2, eligibleActions: [] } });
    writeAdmissionReviewIntent(viewerId, slug, { requestId, input: { operationId, confirmed: true, expectedVersion: 1, decision: "approve", internalReason: "Motivo original" } });
    const transport = vi.fn<typeof fetch>().mockImplementation(async (input) => Response.json(String(input).endsWith("unread-count") ? { unreadCount: 1 } : { notifications: [], unreadCount: 0 }));
    vi.stubGlobal("fetch", transport);
    await act(async () => { render(<>{data.node}<NotificationCenter initialInbox={{ notifications: [], unreadCount: 0 }} /></>, { wrapper: Providers }); });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Notificaciones" })));
    expect(transport.mock.calls.map(([input]) => String(input))).toEqual(["/api/notifications"]);
    await act(async () => original.resolve({ status: "ready", value: { type: "decide_admission_request", state: "completed", operationId, replayed: true, result: { admissionRequestId: requestId, status: "approved", version: 2 } } }));
    expect(data.client.reviewList).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).not.toBeInTheDocument();
    expect(transport.mock.calls.map(([input]) => String(input))).toEqual(["/api/notifications", "/api/notifications"]);
    await act(async () => currentPage.resolve({ status: "ready", value: { items: [], nextCursor: null } }));
    expect(data.client.decide).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve a decision failure after a successful background read", async () => {
    const data = fixture();
    const message = "No se pudo guardar esta decisión. Revisá el motivo antes de intentar otra vez.";
    data.client.decide.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message, uncertain: false });
    await act(async () => { render(data.node, { wrapper: Providers }); });
    fireEvent.change(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason), { target: { value: "Motivo conservado" } });
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(data.client.reviewList).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toHaveValue("Motivo conservado");
  });

  it("should disable decisions when the final viewer read fails and restore them only after a complete current read", async () => {
    const data = fixture();
    await act(async () => { render(data.node, { wrapper: Providers }); });
    fireEvent.change(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason), { target: { value: "Motivo conservado" } });
    fireEvent.click(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm }));
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeEnabled();
    data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: viewerId } }).mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la sesión.", uncertain: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeDisabled();
    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).toHaveValue("Motivo conservado");
    expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeChecked();
    expect(data.client.decide).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("native reviewer container", () => {
  it.each([ADMISSION_DECISION.approve, ADMISSION_DECISION.reject])("should retain the initial live region when the %s decision completes without refreshing the route", async (decision) => {
    const data = fixture();
    data.client.decide.mockResolvedValueOnce({ status: "ready", value: { admissionRequestId: requestId, status: decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected, version: 2 } });
    render(data.node, { wrapper: Providers });
    await confirmDecision();
    const feedback = screen.getByRole("status");
    expect(feedback).toBeEmptyDOMElement();
    expect(feedback).toHaveAttribute("aria-live", "polite");
    expect(feedback).toHaveAttribute("aria-atomic", "true");

    fireEvent.click(screen.getByRole("button", { name: decision === ADMISSION_DECISION.approve ? ADMISSION_REVIEW_UI_COPY.approve : ADMISSION_REVIEW_UI_COPY.reject }));

    const completion = await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    expect(feedback).toContainElement(completion);
    expect(screen.getByRole("status")).toBe(feedback);
    expect(data.client.decide).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each([false, true])("should preserve the server-provided age highlight in the initial inbox or detail %s", async (selected) => {
    const data = fixture(selected);
    data.request.pendingAgeThresholdReached = true;
    const rendered = new DOMParser().parseFromString(renderToString(<Providers>{data.node}</Providers>), "text/html");
    expect(rendered.body.textContent).toContain("Pendiente hace tres días o más");
    render(data.node, { wrapper: Providers });
    expect(screen.getByText("Pendiente hace tres días o más")).toBeVisible();
    await waitFor(() => expect(data.client.viewer).toHaveBeenCalled());
    expect(data.client.reviewList).not.toHaveBeenCalled();
    expect(data.client.reviewDetail).not.toHaveBeenCalled();
  });

  it("should withhold the history action in SSR until the current viewer check makes the detail interactive", async () => {
    const data = fixture();
    const document = new DOMParser().parseFromString(renderToString(<Providers>{data.node}</Providers>), "text/html");
    expect(Array.from(document.querySelectorAll("a")).some((anchor) => anchor.textContent === "Ver historial de la solicitud")).toBe(false);
    render(data.node, { wrapper: Providers });
    expect(await screen.findByRole("link", { name: "Ver historial de la solicitud" })).toBeVisible();
  });
  it("should link the currently visible authorized detail to its exact history and preserve the applied selection", async () => {
    const data = fixture();
    data.state.filters = { limit: 1, source: "common", needsVerification: false, requiresExceptionReason: true, submittedFrom: "2026-10-01T00:00:00.123456Z" };
    render(data.node, { wrapper: Providers });
    const link = await screen.findByRole("link", { name: "Ver historial de la solicitud" });
    const route = new URL(link.getAttribute("href")!, "https://example.invalid");
    expect(route.pathname).toBe(`/${slug}/academia/admissions/history/${requestId}`);
    expect(Object.fromEntries(route.searchParams)).toMatchObject({ status: "all", needsVerification: "false", requiresExceptionReason: "true", submittedFrom: data.state.filters.submittedFrom });
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("should clear unapplied filter edits when restoring the already active pending selection", async () => {
    const data = fixture(false);
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.reset })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Búsqueda"), { target: { value: "Todavía sin aplicar" } });
    fireEvent.change(screen.getByLabelText("Desde (UTC)"), { target: { value: "2026-10-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.reset }));
    expect(screen.getByLabelText("Búsqueda")).toHaveValue("");
    expect(screen.getByLabelText("Desde (UTC)")).toHaveValue("");
    expect(router.push).toHaveBeenCalledExactlyOnceWith(`/${slug}/academia/admissions?limit=25&status=pending`);
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should retain a decided row that still matches all statuses and show its current terminal status", async () => {
    const data = fixture();
    data.request.pendingAgeThresholdReached = true;
    data.state.filters = { limit: 25 };
    render(data.node, { wrapper: Providers }); await confirmDecision();
    expect(screen.getByText("Pendiente hace tres días o más")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close }));
    expect(await screen.findByText(data.request.applicant.name)).toBeVisible();
    expect(screen.getByRole("heading", { name: data.request.applicant.name }).closest("li")).toHaveTextContent(/Aprobada · Solicitud común/);
    expect(screen.queryByText("Pendiente hace tres días o más")).not.toBeInTheDocument();
    expect(data.client.reviewList).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should clear a resolved proof restriction after rejection and keep the terminal row only when its filters allow it", async () => {
    const data = fixture();
    data.state.filters = { limit: 25 };
    data.request.needsVerification = true; data.request.eligibilityReasons = ["local_proof_required"]; data.request.eligibleActions = ["reject"];
    data.client.decide.mockResolvedValueOnce({ status: "ready", value: { admissionRequestId: requestId, status: "rejected", version: 2 } });
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    expect(screen.queryByText("La persona necesita comprobar el contacto de esta solicitud antes de que pueda aprobarse.")).not.toBeInTheDocument();
    expect(screen.getByText("Rechazada", { exact: true })).toBeVisible();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();
  });

  it.each(["needsVerification", "requiresExceptionReason"] as const)("should remove a decided row that no longer matches the applied %s filter", async (field) => {
    const data = fixture();
    data.state.filters = { limit: 25, [field]: true };
    data.request.needsVerification = field === "needsVerification";
    data.request.restrictions.requiresExceptionReason = field === "requiresExceptionReason";
    data.request.eligibilityReasons = [field === "needsVerification" ? "local_proof_required" : "exception_reason_required"];
    data.request.eligibleActions = field === "needsVerification" ? ["reject"] : ["reject", "approve"];
    data.client.decide.mockResolvedValueOnce({ status: "ready", value: { admissionRequestId: requestId, status: "rejected", version: 2 } });
    render(data.node, { wrapper: Providers }); await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject }));
    await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete);
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close }));
    expect(screen.queryByRole("heading", { name: data.request.applicant.name })).not.toBeInTheDocument();
    expect(screen.getByText(ADMISSION_REVIEW_UI_COPY.empty)).toBeVisible();
    expect(data.client.reviewList).not.toHaveBeenCalled();
  });

  it("should recheck a consumed SSR snapshot after Activity restores without an original operation", async () => {
    const data = fixture(false);
    const view = render(<Activity mode="visible">{data.node}</Activity>, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply })).toBeEnabled());
    expect(data.client.reviewList).not.toHaveBeenCalled();
    view.rerender(<Activity mode="hidden">{data.node}</Activity>);
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "Ya no podés revisar solicitudes.", uncertain: false });
    view.rerender(<Activity mode="visible">{data.node}</Activity>);
    expect(await screen.findByText("Ya no podés revisar solicitudes.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: data.request.applicant.name })).not.toBeInTheDocument();
    expect(data.client.reviewList).toHaveBeenCalledExactlyOnceWith(slug, null, expect.any(AbortSignal), DEFAULT_ADMISSION_REVIEW_SELECTION);
    expect(data.client.operation).not.toHaveBeenCalled();
    expect(data.client.decide).not.toHaveBeenCalled();
  });

  it("should reuse the filtered SSR snapshot without another initial list or detail request", async () => {
    const data = fixture(false);
    data.state.filters = { limit: 25, source: "common", needsVerification: false, requiresExceptionReason: false };
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply })).toBeEnabled());
    expect(screen.getByText(data.request.applicant.name)).toBeVisible();
    expect(screen.getByLabelText("Estado")).toHaveTextContent("Todos los estados");
    expect(screen.getByLabelText("Comprobación de contacto")).toHaveTextContent("Sin ese requisito actual");
    expect(data.client.reviewList).not.toHaveBeenCalled();
    expect(data.client.reviewDetail).not.toHaveBeenCalled();
    expect(data.client.viewer).toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should block reversed filter dates, clear the stale error after editing and navigate only to a validated own selection", async () => {
    const data = fixture(false);
    data.state.filters = { limit: 25, source: "common", needsVerification: false, requiresExceptionReason: true };
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply })).toBeEnabled());
    const apply = screen.getByRole("button", { name: ADMISSION_REVIEW_FILTER_COPY.apply });
    fireEvent.change(screen.getByLabelText("Búsqueda"), { target: { value: "  Ana + García  " } });
    fireEvent.change(screen.getByLabelText("Desde (UTC)"), { target: { value: "2026-10-08T12:30" } });
    fireEvent.change(screen.getByLabelText("Hasta (UTC)"), { target: { value: "2026-10-01T12:30" } });
    fireEvent.click(apply);
    expect(screen.getByRole("alert")).toHaveTextContent(ADMISSION_REVIEW_FILTER_COPY.invalid);
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Hasta (UTC)"), { target: { value: "2026-10-09T12:30" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(apply);
    expect(router.push).toHaveBeenCalledOnce();
    const route = new URL(router.push.mock.calls[0][0], "https://tutribu.example.invalid");
    expect(route.pathname).toBe(`/${slug}/academia/admissions`);
    expect(Object.fromEntries(route.searchParams)).toEqual({ limit: "25", status: "all", source: "common", search: "Ana + García", needsVerification: "false", requiresExceptionReason: "true", submittedFrom: "2026-10-08T12:30:00Z", submittedUntil: "2026-10-09T12:30:00Z" });
    expect(data.client.decide).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should advance an empty scanned page with the same applied filters and preserve that selection after opening and closing detail", async () => {
    const data = fixture(false), cursor = "opaque-own-continuation";
    data.state.page = { items: [], nextCursor: cursor };
    data.state.filters = { limit: 25, status: "pending", source: "common", needsVerification: false, requiresExceptionReason: false, search: "Solicitante" };
    render(data.node, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.loadMore })).toBeEnabled());
    expect(screen.getByText(ADMISSION_REVIEW_FILTER_COPY.emptyPage)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.loadMore }));
    expect(await screen.findByText(data.request.applicant.name)).toBeVisible();
    expect(data.client.reviewList).toHaveBeenCalledExactlyOnceWith(slug, cursor, expect.any(AbortSignal), data.state.filters);
    fireEvent.click(screen.getByRole("button", { name: `${ADMISSION_REVIEW_UI_COPY.detail}: ${data.request.applicant.name}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close }));
    expect(screen.getByLabelText("Búsqueda")).toHaveValue("Solicitante");
    for (const call of data.client.reviewList.mock.calls) expect(call[3]).toEqual(data.state.filters);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should preserve confirmed feedback when a current read of the same request fails", async () => {
    const data = fixture();
    render(data.node, { wrapper: Providers });
    await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    expect(await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete)).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read })).toBeEnabled());
    data.client.reviewList.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar esta solicitud. Volvé a intentarlo.", uncertain: false });
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    expect(await screen.findByText("No pudimos consultar esta solicitud. Volvé a intentarlo.")).toBeVisible();
    expect(screen.getByText(ADMISSION_REVIEW_UI_COPY.complete)).toBeVisible();
    expect(data.client.decide).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["admission_closed", "Las admisiones no están disponibles para aprobar esta solicitud. Su plazo no cambia."],
    ["allowlist_requirement_unmet", "No se cumple la lista exigida para esta solicitud."],
    ["evidence_revoked", "La prueba de contacto fue revocada. La persona necesita comprobar el contacto nuevamente."],
  ] as const)("should explain current reviewer reason %s without offering approval", async (reason, message) => {
    const data = fixture();
    data.request.eligibilityReasons = [reason];
    data.request.eligibleActions = ["reject"];
    data.request.needsVerification = reason === "evidence_revoked";
    render(data.node, { wrapper: Providers });
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).not.toBeInTheDocument();
  });

  it.each(["select", "close", "viewer"] as const)("should clear completion feedback when reviewer context changes through %s", async (change) => {
    const data = fixture(), secondId = "58bf0c74-6a77-463d-8ecf-7fa0a4128e35";
    const second: AdmissionReviewDto = { ...data.request, id: secondId, applicant: { ...data.request.applicant, id: "synthetic-other-applicant", name: "Otra solicitud sintética" } };
    data.state.page.items = [data.request, second];
    let decided = false;
    data.client.decide.mockImplementation(async () => { decided = true; return { status: "ready", value: { admissionRequestId: requestId, status: "approved", version: 2 } }; });
    data.client.reviewList.mockImplementation(async () => ({ status: "ready", value: { items: [decided ? { ...data.request, status: "approved", version: 2, eligibleActions: [] } : data.request, second], nextCursor: null } }));
    data.client.reviewDetail.mockImplementation(async (_slug, id) => ({ status: "ready", value: id === secondId ? second : decided ? { ...data.request, status: "approved", version: 2, eligibleActions: [] } : data.request }));
    render(data.node, { wrapper: Providers });
    await confirmDecision();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    expect(await screen.findByText(ADMISSION_REVIEW_UI_COPY.complete)).toBeVisible();
    if (change === "viewer") {
      data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "synthetic-other-reviewer" } });
      fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
      expect(await screen.findByText(ADMISSION_REVIEW_UI_COPY.changedViewer)).toBeVisible();
    } else if (change === "close") {
      fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.close }));
      const row = screen.getByText("Otra solicitud sintética").closest("li");
      if (!row) throw new Error("Synthetic reviewer row unavailable");
      fireEvent.click(row.querySelector("button")!);
      expect(await screen.findByRole("heading", { name: "Otra solicitud sintética" })).toBeVisible();
    }
    await waitFor(() => expect(screen.queryByText(ADMISSION_REVIEW_UI_COPY.complete)).not.toBeInTheDocument());
    expect(data.client.decide).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: ADMISSION_REVIEW_UI_COPY.confirm })).toBeEnabled());
    expect(data.client.reviewDetail).not.toHaveBeenCalled();
    expect(data.client.reviewList).not.toHaveBeenCalled();
    // The new server snapshot owns the initial detail; only an explicit refresh reads it again.
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.read }));
    await waitFor(() => expect(data.client.reviewDetail).toHaveBeenCalled());
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
