/** Exercises list validation, conflict recovery and incremental UI with real shared controls. @module academy-admissions-allowlist-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AllowlistContainer } from "@/app/(platform)/[slug]/academia/admissions/allowlist/allowlist-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistPageState } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";

const router = { back: vi.fn(), bfcacheId: "allowlist-tests", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Actual UI/router children. @returns Native framework context and unmocked shared components. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

/** @returns Safe application props and mocks limited to project-owned transport ports. */
function fixture() {
  const viewerId = randomUUID(), entryId = randomUUID();
  const entry = { id: entryId, version: 1, contactType: "email" as const, identity: "group+tag@example.test", displayName: "Grupo", status: "enabled" as const, source: "manual" as const, createdAt: "2026-10-09T08:00:00Z", updatedAt: "2026-10-09T08:00:00Z" };
  const state: Extract<AllowlistPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic-academy", tribeId: randomUUID(), viewerId, renderedAt: "2026-10-09T08:00:00Z", contactType: "email", page: { items: [entry], nextCursor: null }, query: { limit: 25 } };
  const client: AllowlistBrowserClient = { viewer: vi.fn<AllowlistBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })), list: vi.fn<AllowlistBrowserClient["list"]>(async () => ({ status: "ready", value: { items: [], nextCursor: null } })), read: vi.fn<AllowlistBrowserClient["read"]>(async () => ({ status: "ready", value: { ...entry, version: 2, displayName: "Nombre actual" } })), operation: vi.fn(), write: vi.fn<AllowlistBrowserClient["write"]>(async () => ({ status: "failed", code: "allowlist_conflict", message: "La entrada cambió. Revisala y volvé a confirmar.", uncertain: false })) };
  return { entry, state, client };
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("allowlist route controls", () => {
  it("should show contact validation before dispatch and clear it when the proposal changes", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const confirmation = screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" });
    await waitFor(() => expect(confirmation).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Correo de la entrada"), { target: { value: "invalid" } });
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await screen.findByText("Revisá el contacto, su país y el nombre antes de confirmar.");
    expect(data.client.write).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Correo de la entrada"), { target: { value: "valid@example.test" } });
    expect(screen.queryByText("Revisá el contacto, su país y el nombre antes de confirmar.")).not.toBeInTheDocument();
    expect(confirmation).not.toBeChecked(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep a 409 draft visible until current metadata is read and a new confirmation is made", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const edit = screen.getByRole("button", { name: `Editar ${data.entry.identity}` });
    await waitFor(() => expect(edit).not.toBeDisabled()); fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Nombre orientativo (opcional)"), { target: { value: "Mi borrador" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })); fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    const current = await screen.findByRole("button", { name: "Consultar versión actual" });
    expect(screen.getByLabelText("Nombre orientativo (opcional)")).toHaveValue("Mi borrador");
    expect(screen.getByRole("button", { name: "Guardar entrada" })).toBeDisabled();
    fireEvent.click(current);
    await screen.findByText("Nombre actual");
    expect(screen.getByLabelText("Nombre orientativo (opcional)")).toHaveValue("Mi borrador");
    expect(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })).not.toBeChecked();
    expect(data.client.write).toHaveBeenCalledWith("synthetic-academy", expect.objectContaining({ input: expect.objectContaining({ expectedVersion: 1 }) }), expect.any(AbortSignal));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByText(/No expulsa miembros ni libera un contacto vinculado/)).toBeVisible();
  });

  it("should apply explicit search incrementally and hide contact controls after current authority is lost", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const search = screen.getByRole("button", { name: "Buscar" }); await waitFor(() => expect(search).not.toBeDisabled());
    expect(data.client.list).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Buscar contacto o nombre"), { target: { value: "ausente" } }); fireEvent.click(search);
    await screen.findByText("No hay entradas con estos filtros.");
    expect(data.client.list).toHaveBeenCalledWith("synthetic-academy", { limit: 25, search: "ausente" }, expect.any(AbortSignal));
    vi.mocked(data.client.list).mockResolvedValue({ status: "failed", code: "permission_denied", message: "No tenés permiso para realizar esta operación.", uncertain: false });
    fireEvent.click(search);
    await screen.findByText("El acceso cambió. Volvé a cargar esta página antes de continuar.");
    expect(screen.queryByLabelText("Correo de la entrada")).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
