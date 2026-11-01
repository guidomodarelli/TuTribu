/** Exercises list validation, conflict recovery and incremental UI with real shared controls. @module academy-admissions-allowlist-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemedToaster } from "@golfo/ui";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AllowlistContainer } from "@/app/(platform)/[slug]/academia/admissions/allowlist/allowlist-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistPageState } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import { ALLOWLIST_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { PLATFORM_SECURITY_DIAGNOSTIC_CODE, PLATFORM_SECURITY_NOTICE_COPY, PLATFORM_SECURITY_REQUIREMENT_COPY } from "@/src/modules/academy-admissions/constants/platform-security-notice";
import { changeGuidedStep } from "@/tests/support/guided-steps";

const router = { back: vi.fn(), bfcacheId: "allowlist-tests", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;
/** @param props - Actual UI/router children. @returns Native framework context and unmocked shared components. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}<ThemedToaster /></AppUIProvider></AppRouterContext.Provider>; }

/** Moves the guided entry flow forward with its own Continue button. */
/** Moves to the next step and waits for the previous one to leave. */
async function continueStep() { await changeGuidedStep(screen.getByRole("button", { name: "Continuar" })); }
/** Returns to the previous step and waits for the current one to leave. */
async function backStep() { await changeGuidedStep(screen.getByRole("button", { name: "Atrás" })); }

/** @returns Safe application props and mocks limited to project-owned transport ports. */
function fixture() {
  const viewerId = randomUUID(), entryId = randomUUID();
  const entry = { id: entryId, version: 1, contactType: "email" as const, identity: "group+tag@example.test", displayName: "Grupo", status: "enabled" as const, source: "manual" as const, createdAt: "2026-10-09T08:00:00Z", updatedAt: "2026-10-09T08:00:00Z" };
  const state: Extract<AllowlistPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic-academy", tribeId: randomUUID(), viewerId, renderedAt: "2026-10-09T08:00:00Z", contactType: "email", platformRequirement: null, page: { items: [entry], nextCursor: null }, query: { limit: 25 } };
  const client: AllowlistBrowserClient = { viewer: vi.fn<AllowlistBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })), list: vi.fn<AllowlistBrowserClient["list"]>(async () => ({ status: "ready", value: { items: [], nextCursor: null, platformRequirement: null } })), read: vi.fn<AllowlistBrowserClient["read"]>(async () => ({ status: "ready", value: { ...entry, version: 2, displayName: "Nombre actual" } })), operation: vi.fn(), write: vi.fn<AllowlistBrowserClient["write"]>(async () => ({ status: "failed", code: "allowlist_conflict", message: "La entrada cambió. Revisala y volvé a confirmar.", uncertain: false })) };
  return { entry, state, client };
}

beforeEach(() => { window.sessionStorage.clear(); vi.clearAllMocks(); });

describe("allowlist route controls", () => {
  it("should send the leader to the rules page instead of showing a blocked contact field while no rules are saved", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={{ ...data.state, contactType: null, page: { items: [], nextCursor: null } }} client={data.client} />, { wrapper: Providers });
    expect(await screen.findByRole("heading", { name: ALLOWLIST_BROWSER_COPY.noPolicyTitle })).toBeVisible();
    expect(screen.getByText(ALLOWLIST_BROWSER_COPY.noPolicy)).toBeVisible();
    expect(screen.getByRole("link", { name: ALLOWLIST_BROWSER_COPY.noPolicyAction })).toHaveAttribute("href", "/synthetic-academy/academia/admissions/settings");
    expect(screen.queryByLabelText("Correo de la entrada")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });

  it("should explain the platform block, keep the entries readable and offer no way to add or edit one", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={{ ...data.state, platformRequirement: "recovery_locked" }} client={data.client} />, { wrapper: Providers });
    const notice = await screen.findByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    expect(within(notice).getByText(PLATFORM_SECURITY_REQUIREMENT_COPY.recovery_locked)).toBeVisible();
    expect(within(notice).getByText(ALLOWLIST_BROWSER_COPY.platformConsequence)).toBeVisible();
    expect(within(notice).getByText(PLATFORM_SECURITY_DIAGNOSTIC_CODE.recovery_locked)).toBeVisible();
    expect(screen.getByText(data.entry.identity)).toBeVisible();
    // The initial account check ends; editing stays disabled because of the platform, not because the page is checking.
    await waitFor(() => expect(screen.queryByText(ALLOWLIST_BROWSER_COPY.reading)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeDisabled();
    expect(screen.queryByLabelText("Correo de la entrada")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ALLOWLIST_BROWSER_COPY.noPolicyAction })).not.toBeInTheDocument();
    expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should re-enable adding and editing in the same session when a list read reports the platform problem resolved", async () => {
    const data = fixture();
    vi.mocked(data.client.list).mockResolvedValueOnce({ status: "ready", value: { items: [data.entry], nextCursor: null, platformRequirement: null } });
    render(<AllowlistContainer initialState={{ ...data.state, platformRequirement: "recovery_locked" }} client={data.client} />, { wrapper: Providers });
    await screen.findByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    fireEvent.click(screen.getByText("Buscar y filtrar entradas"));
    const search = screen.getByRole("button", { name: "Buscar" }); await waitFor(() => expect(search).not.toBeDisabled());
    fireEvent.click(search);
    await waitFor(() => expect(screen.queryByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeEnabled();
    expect(data.client.list).toHaveBeenCalledOnce(); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should lift the platform block from its own recheck, keeping the applied filters, without a reload", async () => {
    const data = fixture();
    vi.mocked(data.client.list).mockResolvedValueOnce({ status: "ready", value: { items: [data.entry], nextCursor: null, platformRequirement: null } });
    render(<AllowlistContainer initialState={{ ...data.state, platformRequirement: "recovery_locked" }} client={data.client} />, { wrapper: Providers });
    const notice = await screen.findByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    const recheck = within(notice).getByRole("button", { name: PLATFORM_SECURITY_NOTICE_COPY.recheck }); await waitFor(() => expect(recheck).toBeEnabled());
    fireEvent.click(recheck);
    await waitFor(() => expect(screen.queryByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeEnabled();
    expect(vi.mocked(data.client.list).mock.calls[0]?.[1]).toEqual(data.state.query); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should block adding and editing in the same session when a list read reports a new platform requirement", async () => {
    const data = fixture();
    vi.mocked(data.client.list).mockResolvedValueOnce({ status: "ready", value: { items: [data.entry], nextCursor: null, platformRequirement: "security_unconfigured" } });
    render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    fireEvent.click(screen.getByText("Buscar y filtrar entradas"));
    const search = screen.getByRole("button", { name: "Buscar" }); await waitFor(() => expect(search).not.toBeDisabled());
    fireEvent.click(search);
    const notice = await screen.findByRole("region", { name: PLATFORM_SECURITY_NOTICE_COPY.title });
    expect(within(notice).getByText(PLATFORM_SECURITY_DIAGNOSTIC_CODE.security_unconfigured)).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeDisabled());
    expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should show contact validation before dispatch and clear it when the proposal changes", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const contact = screen.getByLabelText("Correo de la entrada");
    await waitFor(() => expect(contact).not.toBeDisabled());
    // The contact step explains why it cannot continue until a contact is written.
    expect(screen.getByText(ALLOWLIST_BROWSER_COPY.identityRequired)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    fireEvent.change(contact, { target: { value: "invalid" } });
    await continueStep(); await continueStep();
    expect(screen.getByRole("button", { name: "Agregar entrada" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })); fireEvent.click(screen.getByRole("button", { name: "Agregar entrada" }));
    await screen.findByText("Revisá el contacto, su país y el nombre antes de confirmar.");
    expect(data.client.write).not.toHaveBeenCalled();
    await backStep(); await backStep();
    fireEvent.change(screen.getByLabelText("Correo de la entrada"), { target: { value: "valid@example.test" } });
    await continueStep(); await continueStep();
    expect(screen.queryByText("Revisá el contacto, su país y el nombre antes de confirmar.")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })).not.toBeChecked(); expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep a 409 draft visible until current metadata is read and a new confirmation is made", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const edit = screen.getByRole("button", { name: `Editar ${data.entry.identity}` });
    await waitFor(() => expect(edit).not.toBeDisabled()); fireEvent.click(edit);
    // Editing opens the name and status step: the contact of an existing entry is fixed.
    expect(screen.getByText(/No expulsa miembros ni libera un contacto vinculado/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Nombre orientativo (opcional)"), { target: { value: "Mi borrador" } });
    await continueStep();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })); fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    const current = await screen.findByRole("button", { name: "Consultar versión actual" });
    expect(screen.getByText(ALLOWLIST_BROWSER_COPY.conflict)).toBeVisible();
    expect(screen.getByText("Mi borrador")).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar entrada" })).toBeDisabled();
    fireEvent.click(current);
    await screen.findByText("Nombre actual");
    expect(await screen.findByText(ALLOWLIST_BROWSER_COPY.currentRead)).toBeInTheDocument();
    expect(screen.getAllByText("Mi borrador").length).toBeGreaterThan(0);
    expect(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" })).not.toBeChecked();
    expect(data.client.write).toHaveBeenCalledWith("synthetic-academy", expect.objectContaining({ input: expect.objectContaining({ expectedVersion: 1 }) }), expect.any(AbortSignal));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("should keep the pressed save busy while its write is pending and then confirm the save itself, not a recovered original", async () => {
    const data = fixture(); let resolveWrite!: (value: Awaited<ReturnType<AllowlistBrowserClient["write"]>>) => void;
    vi.mocked(data.client.write).mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    const edit = screen.getByRole("button", { name: `Editar ${data.entry.identity}` });
    await waitFor(() => expect(edit).not.toBeDisabled()); fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Nombre orientativo (opcional)"), { target: { value: "Nombre nuevo" } });
    await continueStep();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo el cambio de esta entrada de lista" }));
    const save = screen.getByRole("button", { name: "Guardar entrada" });
    act(() => save.focus()); fireEvent.click(save);
    await waitFor(() => expect(data.client.write).toHaveBeenCalledOnce());
    // The pressed save keeps its label and focus while it shows progress; every other list write stays disabled.
    expect(screen.getByRole("button", { name: "Guardar entrada" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Guardar entrada" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar entrada" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Atrás" })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeDisabled();
    // The write's progress is its own toast, not a second status line on the page.
    expect(await screen.findByText(ALLOWLIST_BROWSER_COPY.saving)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Gestión de lista de habilitados" })).queryByText(ALLOWLIST_BROWSER_COPY.saving)).not.toBeInTheDocument();
    const intent = vi.mocked(data.client.write).mock.calls[0][1];
    await act(async () => resolveWrite({ status: "ready", value: { state: "completed", operationId: intent.input.operationId, replayed: false, result: { entryId: data.entry.id, version: 2, created: false, changed: true } } }));
    expect(await screen.findByText(ALLOWLIST_BROWSER_COPY.saved)).toBeInTheDocument();
    expect(screen.queryByText(ALLOWLIST_BROWSER_COPY.recovered)).not.toBeInTheDocument();
    // After the save lands the flow starts over at the contact of a new entry.
    expect(await screen.findByLabelText("Correo de la entrada")).toHaveValue("");
    expect(data.client.operation).not.toHaveBeenCalled();
  });

  it("should apply explicit search incrementally and hide contact controls after current authority is lost", async () => {
    const data = fixture(); render(<AllowlistContainer initialState={data.state} client={data.client} />, { wrapper: Providers });
    fireEvent.click(screen.getByText("Buscar y filtrar entradas"));
    const search = screen.getByRole("button", { name: "Buscar" }); await waitFor(() => expect(search).not.toBeDisabled());
    expect(data.client.list).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Buscar contacto o nombre"), { target: { value: "ausente" } }); fireEvent.click(search);
    await screen.findByText("No hay entradas con estos filtros.");
    expect(data.client.list).toHaveBeenCalledWith("synthetic-academy", { limit: 25, search: "ausente" }, expect.any(AbortSignal));
    vi.mocked(data.client.list).mockResolvedValue({ status: "failed", code: "permission_denied", message: "No tenés permiso para realizar esta operación.", uncertain: false });
    fireEvent.click(search);
    await screen.findByText("No tenés permiso para realizar esta operación.");
    expect(screen.queryByLabelText("Correo de la entrada")).not.toBeInTheDocument();
    // The closed view keeps a way back instead of leaving only a sentence.
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("allowlist «Ver más»", () => {
  it("should add the next page below the shown entries without repeating one, and keep them all when a later page fails", async () => {
    const data = fixture(), second = { ...data.entry, id: randomUUID(), identity: "second@example.test", displayName: "Segunda" };
    const failure = "No pudimos consultar más entradas. Volvé a intentarlo.";
    let finish!: (result: Awaited<ReturnType<AllowlistBrowserClient["list"]>>) => void;
    vi.mocked(data.client.list)
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ status: "failed", code: "dependency_unavailable", message: failure, uncertain: false });
    render(<AllowlistContainer initialState={{ ...data.state, page: { items: [data.entry], nextCursor: "synthetic-cursor-1" } }} client={data.client} />, { wrapper: Providers });
    const more = screen.getByRole("button", { name: "Ver más entradas" });
    await waitFor(() => expect(more).toBeEnabled());

    fireEvent.click(more);
    await waitFor(() => expect(data.client.list).toHaveBeenCalledOnce());
    expect(data.client.list).toHaveBeenLastCalledWith(data.state.slug, { limit: 25, cursor: "synthetic-cursor-1" }, expect.any(AbortSignal));
    // While the next page loads, the shown entry stays and only its button reports progress.
    expect(screen.getByRole("button", { name: `Editar ${data.entry.identity}` })).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(ALLOWLIST_BROWSER_COPY.reading)).not.toBeInTheDocument();

    // The next page repeats the shown entry; it is listed once, followed by the new one.
    await act(async () => { finish({ status: "ready", value: { items: [data.entry, second], nextCursor: "synthetic-cursor-2", platformRequirement: null } }); });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Editar / }).map((button) => button.getAttribute("aria-label"))).toEqual([`Editar ${data.entry.identity}`, `Editar ${second.identity}`]));

    fireEvent.click(screen.getByRole("button", { name: "Ver más entradas" }));
    await waitFor(() => expect(data.client.list).toHaveBeenCalledTimes(2));
    expect(data.client.list).toHaveBeenLastCalledWith(data.state.slug, { limit: 25, cursor: "synthetic-cursor-2" }, expect.any(AbortSignal));
    // The failure stays next to the button, which can retry the same page, and the loaded entries remain.
    const alert = await screen.findByText(failure);
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.parentElement).toContainElement(screen.getByRole("button", { name: "Ver más entradas" }));
    expect(screen.getAllByRole("button", { name: /^Editar / })).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver más entradas" })).toBeEnabled());
  });
});
