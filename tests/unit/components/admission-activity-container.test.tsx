/** Exercises the actual private activity container and shared controls through its own browser read port. @module admission-activity-container-tests */
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@guidomodarelli/beez-ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
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
  const node = <AdmissionSettingsPage title="Consumo e historial de admisión"><AdmissionActivityContainer initialState={state} client={client} /></AdmissionSettingsPage>;
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
