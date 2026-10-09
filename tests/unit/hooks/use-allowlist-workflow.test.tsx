/** Exercises current list workflow behavior through owned ports without replacing UI/auth/platform libraries. @module use-allowlist-workflow-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowlistWorkflow } from "@/hooks/use-allowlist-workflow";
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistPageState } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import { writeAllowlistWorkflow } from "@/lib/academy-admissions/allowlist-intent";

afterEach(() => window.sessionStorage.clear());

/** @returns Safe SSR state plus native-shaped owned transport collaborators. */
function fixture() {
  const viewerId = randomUUID(), entryId = randomUUID();
  const entry = { id: entryId, version: 1, contactType: "email" as const, identity: "entry+tag@example.test", displayName: "Original", status: "enabled" as const, source: "manual" as const, createdAt: "2026-10-09T05:00:00Z", updatedAt: "2026-10-09T05:00:00Z" };
  const initialState: Extract<AllowlistPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic-academy", tribeId: randomUUID(), viewerId, renderedAt: "2026-10-09T05:00:00Z", contactType: "email", page: { items: [entry], nextCursor: null }, query: { limit: 25 } };
  const client: AllowlistBrowserClient = { viewer: vi.fn<AllowlistBrowserClient["viewer"]>(async () => ({ status: "ready", value: { id: viewerId } })), list: vi.fn<AllowlistBrowserClient["list"]>(async () => ({ status: "ready", value: initialState.page })), read: vi.fn<AllowlistBrowserClient["read"]>(async () => ({ status: "ready", value: entry })), operation: vi.fn<AllowlistBrowserClient["operation"]>(), write: vi.fn<AllowlistBrowserClient["write"]>(async (_slug, intent) => ({ status: "ready", value: { state: "completed", operationId: intent.input.operationId, replayed: false, result: { entryId, version: 2, created: false, changed: true } } })) };
  return { entry, client, initialState };
}

describe("list workflow ownership", () => {
  it("should hydrate an owned draft without consent, duplicate SSR list fetch or mutation", async () => {
    const data = fixture();
    writeAllowlistWorkflow({ viewerId: data.initialState.viewerId, slug: data.initialState.slug, draft: { identity: "draft@example.test", country: "", displayName: "Borrador", status: "enabled", entryId: null, expectedVersion: null }, pending: null });
    const { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.draft.displayName).toBe("Borrador");
    expect(result.current.confirmed).toBe(false);
    expect(data.client.list).not.toHaveBeenCalled(); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should reject an invalid contact before creating an original or looking up another viewer", async () => {
    const data = fixture(), { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const viewerCalls = vi.mocked(data.client.viewer).mock.calls.length;
    act(() => { result.current.changeDraft({ ...result.current.draft, identity: "invalid" }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.fieldError).toBeTruthy(); expect(result.current.pending).toBeNull();
    expect(data.client.write).not.toHaveBeenCalled(); expect(vi.mocked(data.client.viewer).mock.calls).toHaveLength(viewerCalls);
  });

  it("should preserve a conflicted draft and require current version plus new confirmation", async () => {
    const data = fixture();
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "allowlist_conflict", message: "La entrada cambió.", uncertain: false });
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: { ...data.entry, version: 2, displayName: "Servidor" } });
    const { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.select(data.entry));
    act(() => { result.current.changeDraft({ ...result.current.draft, displayName: "Mi borrador" }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.conflict).toBe(true); expect(result.current.draft.displayName).toBe("Mi borrador"); expect(result.current.confirmed).toBe(false);
    await act(async () => result.current.readCurrentEntry());
    expect(result.current.draft).toMatchObject({ displayName: "Mi borrador", expectedVersion: 2 });
    expect(result.current.conflict).toBe(false); expect(result.current.confirmed).toBe(false); expect(data.client.write).toHaveBeenCalledOnce();
  });

  it("should query an uncertain original once without another write and use current metadata rather than its old version", async () => {
    const data = fixture();
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "Respuesta perdida.", uncertain: true });
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: { ...data.entry, version: 4, displayName: "Actual" } });
    const { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.select(data.entry));
    act(() => { result.current.changeDraft({ ...result.current.draft, displayName: "Cambio" }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    const original = result.current.pending!;
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "update_allowlist_entry", operationId: original.input.operationId, state: "completed", replayed: true, result: { entryId: data.entry.id, version: 2, created: false, changed: true } } });
    await act(async () => result.current.readOriginal());
    expect(result.current.page.items[0]).toMatchObject({ version: 4, displayName: "Actual" }); expect(result.current.pending).toBeNull();
    expect(data.client.write).toHaveBeenCalledOnce(); expect(data.client.operation).toHaveBeenCalledOnce();
  });

  it("should hide prior contacts when an entry read detects lost permission for the same account", async () => {
    const data = fixture();
    vi.mocked(data.client.read).mockResolvedValue({ status: "failed", code: "permission_denied", message: "Sin acceso.", uncertain: false });
    const { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.select(data.entry));
    await act(async () => result.current.readCurrentEntry());
    expect(result.current.privateVisible).toBe(false); expect(result.current.ready).toBe(false);
  });

  it("should ignore a late private list response after the native account changes", async () => {
    const data = fixture(), { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.mocked(data.client.viewer).mockResolvedValueOnce({ status: "ready", value: { id: data.initialState.viewerId } }).mockResolvedValueOnce({ status: "ready", value: { id: randomUUID() } });
    vi.mocked(data.client.list).mockResolvedValue({ status: "ready", value: { items: [{ ...data.entry, displayName: "Dato tardío" }], nextCursor: null } });
    await act(async () => result.current.searchEntries());
    expect(result.current.privateVisible).toBe(false); expect(result.current.confirmed).toBe(false);
    expect(result.current.page.items[0]?.displayName).toBe("Original");
    expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should cancel the actual read signal on unmount without dispatching another request", async () => {
    const data = fixture(); let readSignal: AbortSignal | undefined;
    vi.mocked(data.client.list).mockImplementation(async (_slug, _query, signal) => { readSignal = signal; return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true })); });
    const { result, unmount } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let reading: Promise<void> | undefined;
    act(() => { reading = result.current.searchEntries(); });
    await waitFor(() => expect(readSignal).toBeDefined());
    unmount(); await reading;
    expect(readSignal!.aborted).toBe(true); expect(data.client.list).toHaveBeenCalledOnce(); expect(data.client.write).not.toHaveBeenCalled();
  });

  it("should preserve the same unresolved original when a current-version action is invoked", async () => {
    const data = fixture(); vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "Respuesta perdida.", uncertain: true });
    const { result } = renderHook(() => useAllowlistWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.select(data.entry)); act(() => { result.current.changeDraft({ ...result.current.draft, displayName: "Borrador" }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    const originalId = result.current.pending!.input.operationId;
    await act(async () => result.current.readCurrentEntry());
    expect(result.current.pending!.input.operationId).toBe(originalId); expect(result.current.draft.displayName).toBe("Borrador");
    expect(data.client.read).not.toHaveBeenCalled(); expect(data.client.write).toHaveBeenCalledOnce();
  });

  it("should refresh a full first page cursor after creation so its prior final entry remains reachable", async () => {
    const data = fixture(), added = { ...data.entry, id: randomUUID(), identity: "new@example.test" }, cursor = `2026-10-09T06:00:00Z~${added.id}`;
    data.initialState.query.limit = 1; data.initialState.page.nextCursor = `2026-10-09T05:00:00Z~${data.entry.id}`;
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: added });
    vi.mocked(data.client.write).mockImplementation(async (_slug, intent) => ({ status: "ready", value: { state: "completed", operationId: intent.input.operationId, replayed: false, result: { entryId: added.id, version: 1, changed: true, created: true } } }));
    vi.mocked(data.client.list).mockResolvedValueOnce({ status: "ready", value: { items: [added], nextCursor: cursor } }).mockResolvedValueOnce({ status: "ready", value: { items: [data.entry], nextCursor: null } });
    const { result } = renderHook(() => useAllowlistWorkflow(data)); await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.changeDraft({ ...result.current.draft, identity: added.identity }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.page).toEqual({ items: [added], nextCursor: cursor });
    await act(async () => result.current.next());
    expect(result.current.page.items).toEqual([data.entry]);
    expect(data.client.list).toHaveBeenLastCalledWith(data.initialState.slug, { limit: 1, cursor }, expect.any(AbortSignal));
    expect(data.client.write).toHaveBeenCalledOnce();
  });

  it("should explain an incompatible duplicate creation without offering entry-version recovery on an absent entry id", async () => {
    const data = fixture(); vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "allowlist_conflict", message: "La entrada cambió. Revisala y volvé a confirmar.", uncertain: false });
    const { result } = renderHook(() => useAllowlistWorkflow(data)); await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.changeDraft({ ...result.current.draft, identity: data.entry.identity }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.draft.entryId).toBeNull(); expect(result.current.draft.identity).toBe(data.entry.identity);
    expect(result.current.conflict).toBe(false); expect(result.current.errorMessage).toContain("Buscalo en la lista");
    expect(result.current.confirmed).toBe(false); expect(result.current.pending).toBeNull(); expect(data.client.read).not.toHaveBeenCalled();
  });

  it("should preserve the server OR filter rather than inventing a match across concatenated contact and name", async () => {
    const data = fixture(), added = { ...data.entry, id: randomUUID(), identity: "new@example.test", displayName: "Grupo" };
    data.initialState.page.items = []; data.initialState.query.search = "@example.test Grupo";
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: added });
    vi.mocked(data.client.write).mockImplementation(async (_slug, intent) => ({ status: "ready", value: { state: "completed", operationId: intent.input.operationId, replayed: false, result: { entryId: added.id, version: 1, changed: true, created: true } } }));
    const { result } = renderHook(() => useAllowlistWorkflow(data)); await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.changeDraft({ ...result.current.draft, identity: added.identity, displayName: added.displayName }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.pending).toBeNull(); expect(result.current.page.items).toEqual([]); expect(data.client.write).toHaveBeenCalledOnce();
  });

  it("should prepare only the exact entry-bound global confirmation while preserving the draft without another write", async () => {
    const data = fixture(), reauthentication = { create: vi.fn(async () => ({ status: "ready" as const, href: "/auth/reauthenticate?intentId=synthetic" })) };
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "reauthentication_required", message: "Volvé a autenticarte para confirmar esta operación sensible.", uncertain: false });
    const { result } = renderHook(() => useAllowlistWorkflow({ ...data, reauthentication })); await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.select(data.entry)); act(() => { result.current.changeDraft({ ...result.current.draft, displayName: "Conservar" }); result.current.setConfirmed(true); });
    await act(async () => result.current.save());
    expect(result.current.reauthenticationRequired).toBe(true); expect(result.current.confirmed).toBe(false);
    await act(async () => result.current.reauthenticate());
    expect(reauthentication.create).toHaveBeenCalledWith({ tribeId: data.initialState.tribeId, resourceId: data.entry.id, operation: "update_allowlist_entry", returnPath: "/synthetic-academy/academia/admissions/allowlist", confirmed: true }, expect.any(AbortSignal));
    expect(result.current.recoveryHref).toBe("/auth/reauthenticate?intentId=synthetic"); expect(result.current.draft.displayName).toBe("Conservar");
    expect(result.current.pending).toBeNull(); expect(data.client.write).toHaveBeenCalledOnce();
  });
});
