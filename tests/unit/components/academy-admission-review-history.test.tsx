/** Exercises actual React Activity, framework router context and @astra-kit/ui with only the owned viewer port doubled. @module academy-admission-review-history-tests */
import { AdmissionWorkspaceRoute } from "@/tests/support/admission-workspace-route";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarInset, SidebarProvider } from "@astra-kit/ui";
import { AdmissionReviewHistoryContainer } from "@/app/(platform)/[slug]/academia/admissions/history/[requestId]/history-container";
import AdmissionReviewHistoryError from "@/app/(platform)/[slug]/academia/admissions/history/[requestId]/error";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AdmissionReviewHistoryPageState } from "@/src/modules/academy-admissions/application/results/admission-review-history-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";

const router = { back: vi.fn(), bfcacheId: "synthetic-history", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Actual route/provider children. @returns Real application UI and framework router wiring. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider><SidebarProvider><SidebarInset>{children}</SidebarInset></SidebarProvider></AppUIProvider></AppRouterContext.Provider>; }

/** @returns Only safe public facts and the owned current-viewer boundary. */
function fixture() {
  const state: Extract<AdmissionReviewHistoryPageState, { kind: "ready" }> = {
    kind: "ready", slug: "academia-sintetica", viewerId: "synthetic-reviewer", renderedAt: "2026-10-16T03:00:00.000Z", hasPrevious: true,
    filters: { limit: 1, needsVerification: false, requiresExceptionReason: true, source: "common", submittedFrom: "2026-10-01T00:00:00.123456Z" },
    page: { tribeId: "32bfd723-c02c-4adc-94fc-508f9e84aa55", admissionRequestId: "7e840e08-23ed-4997-bf27-e4a889353783", items: [{ id: "393c14f3-f37e-4b4c-a585-31a260b574dc", eventType: "unclassified", fromStatus: null, toStatus: "pending", resourceVersion: 1, actorKind: "unattributed", createdAt: "2026-10-16T01:00:00.123Z" }], nextCursor: "2026-10-16T01:00:00.123456Z~393c14f3-f37e-4b4c-a585-31a260b574dc" },
  };
  const client = { viewer: vi.fn<AdmissionBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: state.viewerId } })) };
  return { state, client, node: <AdmissionReviewHistoryContainer initialState={state} client={client} /> };
}

beforeEach(() => vi.clearAllMocks());

describe("current history visibility and navigation", () => {
  it("should render authorized SSR facts while withholding continuation and refresh until the current viewer is checked", () => {
    const data = fixture();
    const document = new DOMParser().parseFromString(renderToString(<Providers>{data.node}</Providers>), "text/html");
    expect(document.querySelector("ol")?.textContent).toContain("Evento conservado");
    expect(Array.from(document.querySelectorAll("a")).some((anchor) => anchor.textContent === ADMISSION_REVIEW_HISTORY_COPY.older || anchor.textContent === ADMISSION_REVIEW_HISTORY_COPY.newest)).toBe(false);
    const refresh = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === ADMISSION_REVIEW_HISTORY_COPY.refresh);
    expect(refresh?.disabled).toBe(true);
  });
  it.each(["unavailable", "render_error"])("should preserve one real platform main and a history page heading for %s", (path) => {
    const unavailable: AdmissionReviewHistoryPageState = { kind: "unavailable", code: "permission_denied", message: "No tenés permiso para realizar esta operación." };
    render(<AdmissionWorkspaceRoute pathname="/tribu/academia/admissions/history/request-1" slug="tribu">{path === "unavailable" ? <AdmissionReviewHistoryContainer initialState={unavailable} /> : <AdmissionReviewHistoryError reset={vi.fn()} />}</AdmissionWorkspaceRoute>, { wrapper: Providers });
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: ADMISSION_REVIEW_HISTORY_COPY.title })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });
  it("should confirm the native viewer once and reuse the authorized server history without an ordinary route refresh", async () => {
    const data = fixture();
    render(data.node, { wrapper: Providers });
    // Each event morphs out of its skeleton, so it becomes visible once its entrance settles.
    await waitFor(() => expect(screen.getByRole("heading", { name: "Evento conservado" })).toBeVisible());
    await waitFor(() => expect(screen.getByText("Sin atribución disponible")).toBeVisible());
    expect(screen.queryByText("El sistema")).not.toBeInTheDocument();
    expect(screen.getByText("15 oct · 22:00")).toHaveAttribute("dateTime", data.state.page.items[0].createdAt);
    expect(data.client.viewer).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
    const back = new URL(screen.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.back }).getAttribute("href")!, "https://example.invalid");
    const older = new URL(screen.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.older }).getAttribute("href")!, "https://example.invalid");
    const newest = new URL(screen.getByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.newest }).getAttribute("href")!, "https://example.invalid");
    expect(Object.fromEntries(back.searchParams)).toMatchObject({ request: data.state.page.admissionRequestId, status: "all", needsVerification: "false", requiresExceptionReason: "true", submittedFrom: data.state.filters.submittedFrom });
    expect(older.searchParams.get("historyCursor")).toBe(data.state.page.nextCursor);
    expect(newest.searchParams.has("historyCursor")).toBe(false);
  });

  it("should hide previous-account facts and offer safe current-server recovery", async () => {
    const data = fixture();
    data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: "different-synthetic-account" } });
    render(data.node, { wrapper: Providers });
    expect(await screen.findByRole("alert")).toHaveTextContent(ADMISSION_REVIEW_HISTORY_COPY.changedViewer);
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ADMISSION_REVIEW_HISTORY_COPY.older })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_HISTORY_COPY.refresh }));
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(ADMISSION_REVIEW_HISTORY_COPY.checking);
    // While access is confirmed again, the list keeps skeleton rows in place of events and exposes no private facts.
    const events = screen.getByRole("list", { name: "Eventos de la solicitud" });
    expect(events.closest("[aria-busy='true']")).not.toBeNull();
    expect(within(events).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(events).queryByRole("heading")).not.toBeInTheDocument();
  });

  it.each(["failed", "throws"])("should close private visibility on viewer %s with actionable safe feedback", async (failure) => {
    const data = fixture();
    if (failure === "throws") data.client.viewer.mockRejectedValueOnce(new Error("Private viewer diagnostic"));
    else data.client.viewer.mockResolvedValueOnce({ status: "failed", code: "unexpected_failure", message: "Private viewer diagnostic", uncertain: false });
    render(data.node, { wrapper: Providers });
    expect(await screen.findByRole("alert")).toHaveTextContent(ADMISSION_REVIEW_HISTORY_COPY.readFailed);
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
    expect(screen.queryByText("Private viewer diagnostic")).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should abort an unresolved viewer check when hidden and require fresh server role authority on Activity restoration", async () => {
    const data = fixture();
    let finish: ((result: Awaited<ReturnType<AdmissionBrowserClient["viewer"]>>) => void) | undefined;
    data.client.viewer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const tree = (mode: "visible" | "hidden", state: AdmissionReviewHistoryPageState = data.state) => <Activity mode={mode}><AdmissionReviewHistoryContainer initialState={state} client={data.client} /></Activity>;
    const view = render(tree("visible"), { wrapper: Providers });
    const signal = data.client.viewer.mock.calls[0][0];
    view.rerender(tree("hidden"));
    expect(signal.aborted).toBe(true);
    await act(async () => { finish?.({ status: "ready", value: { id: data.state.viewerId } }); });
    view.rerender(tree("visible"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
    expect(data.client.viewer).toHaveBeenCalledOnce();
    view.rerender(tree("visible", { kind: "unavailable", code: "permission_denied", message: "No tenés permiso para realizar esta operación." }));
    expect(screen.getByRole("alert")).toHaveTextContent("No tenés permiso");
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
  });

  it("should refresh only restored browser documents and hide previous facts until the fresh server snapshot arrives", async () => {
    const data = fixture(), view = render(data.node, { wrapper: Providers });
    await screen.findByRole("heading", { name: "Evento conservado" });
    const ordinary = new Event("pageshow"); Object.defineProperty(ordinary, "persisted", { value: false });
    fireEvent(window, ordinary);
    expect(router.refresh).not.toHaveBeenCalled();
    const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
    view.rerender(<AdmissionReviewHistoryContainer initialState={{ ...data.state, renderedAt: "2026-10-16T03:01:00.000Z", page: { ...data.state.page, items: [], nextCursor: null } }} client={data.client} />);
    expect(await screen.findByText(ADMISSION_REVIEW_HISTORY_COPY.empty)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("should abort on unmount without publishing a late viewer response", async () => {
    const data = fixture();
    let finish: ((result: Awaited<ReturnType<AdmissionBrowserClient["viewer"]>>) => void) | undefined;
    data.client.viewer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(data.node, { wrapper: Providers });
    const signal = data.client.viewer.mock.calls[0][0];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { finish?.({ status: "ready", value: { id: data.state.viewerId } }); });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should cancel a pending viewer before document restoration so its late result cannot republish old history", async () => {
    const data = fixture();
    let finish: ((result: Awaited<ReturnType<AdmissionBrowserClient["viewer"]>>) => void) | undefined;
    data.client.viewer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(data.node, { wrapper: Providers });
    const signal = data.client.viewer.mock.calls[0][0];
    const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);
    expect(signal.aborted).toBe(true);
    await act(async () => { finish?.({ status: "ready", value: { id: data.state.viewerId } }); });
    expect(screen.queryByRole("heading", { name: "Evento conservado" })).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
