/** Exercises the actual private activity container and shared controls through its own browser read port. @module admission-activity-container-tests */
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@golfo/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { AdmissionWorkspaceRoute } from "@/tests/support/admission-workspace-route";
import { AdmissionActivityContainer } from "@/app/(platform)/[slug]/academia/admissions/activity/admission-activity-container";
import type { AdmissionActivityBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-activity-browser-client";
import { createAdmissionActivityPageFixture } from "@/tests/support/admission-activity-page";

const router = { back: vi.fn(), bfcacheId: "private-activity-test", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Test children. @returns Actual framework/shared UI without platform or component mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider><SidebarProvider><SidebarInset>{children}</SidebarInset></SidebarProvider></AppUIProvider></AppRouterContext.Provider>; }
/** @returns Own SSR state and read outcomes without write, provider or secret capabilities. */
function fixture() {
  const state = createAdmissionActivityPageFixture();
  const client = {
    viewer: vi.fn<AdmissionActivityBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: state.viewerId } })),
    read: vi.fn<AdmissionActivityBrowserClient["read"]>(async (_slug, selection) => ({ status: "ready", value: { ...state, selection } })),
  };
  const node = <AdmissionWorkspaceRoute pathname={`/${state.kind === "ready" ? state.slug : "tribu"}/academia/admissions/activity`} slug={state.kind === "ready" ? state.slug : "tribu"}><AdmissionSettingsPage page="activity"><AdmissionActivityContainer initialState={state} client={client} /></AdmissionSettingsPage></AdmissionWorkspaceRoute>;
  return { state, client, node };
}
/** @returns The enabled explicit read control after the initial native identity check. */
async function currentReadButton() {
  const button = screen.getByRole("button", { name: "Actualizar consumo e historial" });
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

beforeEach(() => vi.clearAllMocks());
describe("private activity browser workflow", () => {
  it("should use SSR data once and reject invalid filters before any snapshot request, clearing feedback on edit", async () => {
    const data = fixture();
    render(data.node, { wrapper: Providers });
    await currentReadButton();
    expect(data.client.read).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Referencia del recurso (opcional)" }), { target: { value: "invalid-reference" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá el tipo de recurso");
    expect(data.client.read).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Referencia del recurso (opcional)" }), { target: { value: "" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    await currentReadButton();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should cancel an older read and ignore its late result after a newer configuration and consumption are shown", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    let completeOld!: (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => void;
    data.client.read.mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }));
    fireEvent.click(await currentReadButton());
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    const latest = structuredClone(data.state); latest.metrics.usage.policyVersion = 9; latest.metrics.usage.verificationToday = 12;
    if (latest.currentUsage.policy) latest.currentUsage.policy.version = 9;
    data.client.read.mockResolvedValueOnce({ status: "ready", value: latest });
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
    await waitFor(() => expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument());
    await act(async () => { completeOld({ status: "ready", value: data.state }); });
    expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument();
    expect(screen.getByText("Códigos consumidos").closest("div")).toHaveTextContent("12");
    expect(data.client.read.mock.calls[0][2].aborted).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep private content withheld when another read starts between viewer completion and result installation", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await currentReadButton();
    data.client.viewer.mockResolvedValueOnce({ status: "ready", value: { id: data.state.viewerId } });
    data.client.viewer.mockImplementationOnce(() => {
      const result = Promise.resolve({ status: "ready" as const, value: { id: data.state.viewerId } });
      void result.then(() => queueMicrotask(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))));
      return result;
    });
    const old = structuredClone(data.state); old.metrics.usage.policyVersion = 7;
    if (old.currentUsage.policy) old.currentUsage.policy.version = 7;
    let completeNew!: (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => void;
    data.client.read.mockResolvedValueOnce({ status: "ready", value: old }).mockImplementationOnce(() => new Promise((resolve) => { completeNew = resolve; }));
    fireEvent.click(await currentReadButton());
    await waitFor(() => expect(data.client.read).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Consultando consumo e historial");
    expect(screen.queryByText(/Configuración actual: versión 7/)).not.toBeInTheDocument();
    await act(async () => { completeNew({ status: "ready", value: data.state }); });
    await currentReadButton();
    expect(screen.getByText(/Configuración actual: versión 6/)).toBeInTheDocument();
  });

  it("should hide the prior account's private data when native identity changes after an outstanding response", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    let complete!: (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => void;
    data.client.read.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    fireEvent.click(await currentReadButton());
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    data.client.viewer.mockResolvedValue({ status: "ready", value: { id: "synthetic-other-viewer" } });
    await act(async () => { complete({ status: "ready", value: data.state }); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La cuenta cambió"));
    expect(screen.queryByRole("region", { name: "Consumo del día UTC" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cambio de países y cupos")).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("should clear a failed read's alert during retry and restore data only after current authorization succeeds", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    data.client.read.mockResolvedValueOnce({ status: "failed", code: "permission_denied", message: "No tenés permiso para consultar este historial.", uncertain: false });
    fireEvent.click(await currentReadButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No tenés permiso"));
    expect(screen.queryByText("Códigos consumidos")).not.toBeInTheDocument();
    let complete!: (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => void;
    data.client.read.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(data.client.read).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Consultando consumo e historial");
    await act(async () => { complete({ status: "ready", value: data.state }); });
    await currentReadButton();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should preserve exact pagination and abort the active private read when unmounted", async () => {
    const data = fixture(); data.state.activity.nextCursor = `2026-10-13T12:00:00.000999Z|${data.state.activity.items[0].id}`;
    const view = render(data.node, { wrapper: Providers });
    await currentReadButton();
    data.client.read.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Ver actividad anterior" }));
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    expect(data.client.read.mock.calls[0][1].cursor).toBe(data.state.activity.nextCursor);
    const signal = data.client.read.mock.calls[0][2];
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("activity kept on screen while it is reread", () => {
  /** @returns The pending read and the function that settles it. */
  function pendingRead(data: ReturnType<typeof fixture>) {
    let complete!: (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => void;
    data.client.read.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    return (result: Awaited<ReturnType<AdmissionActivityBrowserClient["read"]>>) => complete(result);
  }
  /** @param data - Own fixture. @param version - Current configuration version of the fresh snapshot. @returns A fresh snapshot that differs from the one on screen. */
  function newerSnapshot(data: ReturnType<typeof fixture>, version: number) {
    const latest = structuredClone(data.state); latest.metrics.usage.policyVersion = version;
    if (latest.currentUsage.policy) latest.currentUsage.policy.version = version;
    return latest;
  }

  it("should keep the shown consumption and history while returning to the tab rereads them, then show the fresh snapshot", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await currentReadButton();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const complete = pendingRead(data);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    expect(screen.getByText("Cambio de países y cupos")).toBeInTheDocument();
    expect(screen.getByText(/Configuración actual: versión 6/)).toBeInTheDocument();
    const status = screen.getByText("Actualizando consumo e historial…");
    expect(status).toHaveAttribute("role", "status");
    expect(status.closest("[aria-busy='true']")).not.toBeNull();
    await act(async () => { complete({ status: "ready", value: newerSnapshot(data, 9) }); });
    await waitFor(() => expect(screen.getByText(/Configuración actual: versión 9/)).toBeInTheDocument());
    expect(screen.queryByText("Actualizando consumo e historial…")).not.toBeInTheDocument();
    expect(screen.getByText("Cambio de países y cupos")).toBeInTheDocument();
    visibility.mockRestore();
  });

  it("should keep the previous results while new filters load and keep them with an inline alert when that read fails", async () => {
    const data = fixture(); render(data.node, { wrapper: Providers });
    await currentReadButton();
    const complete = pendingRead(data);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    expect(screen.getByText("Cambio de países y cupos")).toBeInTheDocument();
    expect(screen.getByText("Actualizando consumo e historial…")).toHaveAttribute("role", "status");
    await act(async () => { complete({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar el historial filtrado.", uncertain: false }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos consultar el historial filtrado.");
    expect(screen.getByText("Cambio de países y cupos")).toBeInTheDocument();
    await currentReadButton();
  });

  it("should add older activity below the shown facts without repeating one and show its failure next to its button", async () => {
    const data = fixture(), shown = data.state.activity.items[0];
    const older = { ...shown, id: "0f5f8d3c-6d4e-4f1a-9a55-1c2b3d4e5f60", createdAt: "2026-10-12T12:00:00.000Z" };
    data.state.activity.nextCursor = `2026-10-13T12:00:00.000000Z|${shown.id}`;
    render(data.node, { wrapper: Providers });
    await currentReadButton();
    const complete = pendingRead(data);
    fireEvent.click(screen.getByRole("button", { name: "Ver actividad anterior" }));
    await waitFor(() => expect(data.client.read).toHaveBeenCalledOnce());
    // While the older page loads, the shown fact stays and only its button reports progress.
    expect(screen.getByRole("button", { name: "Ver actividad anterior" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Actualizando consumo e historial…")).not.toBeInTheDocument();
    expect(screen.getAllByText("Cambio de países y cupos")).toHaveLength(1);
    const olderPage = structuredClone(data.state);
    olderPage.selection = { ...data.state.selection, cursor: data.state.activity.nextCursor };
    olderPage.activity = { ...data.state.activity, items: [shown, older], nextCursor: `2026-10-12T12:00:00.000000Z|${older.id}` };
    await act(async () => { complete({ status: "ready", value: olderPage }); });
    await waitFor(() => expect(Array.from(document.querySelectorAll("li time")).map((time) => time.getAttribute("datetime"))).toEqual([shown.createdAt, older.createdAt]));

    data.client.read.mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: "No pudimos consultar la actividad anterior.", uncertain: false });
    fireEvent.click(await currentOlderButton());
    await waitFor(() => expect(data.client.read).toHaveBeenCalledTimes(2));
    expect(data.client.read.mock.calls[1][1]).toEqual({ limit: 25, cursor: olderPage.activity.nextCursor });
    const alert = await screen.findByText("No pudimos consultar la actividad anterior.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.parentElement).toContainElement(screen.getByRole("button", { name: "Ver actividad anterior" }));
    expect(screen.getAllByText("Cambio de países y cupos")).toHaveLength(2);
  });
});

/** @returns The enabled older-page control once no read is in flight. */
async function currentOlderButton() {
  const button = screen.getByRole("button", { name: "Ver actividad anterior" });
  await waitFor(() => expect(button).not.toBeDisabled());
  await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  return button;
}
