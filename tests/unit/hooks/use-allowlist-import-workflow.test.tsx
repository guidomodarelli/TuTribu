/** Exercises explicit import UI actions through owned ports with real React and stored intent guards. @module use-allowlist-import-workflow-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import { writeAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { createAllowlistImportDraftStoreFixture } from "@/tests/support/allowlist-import-draft-store-fixture";

afterEach(() => window.sessionStorage.clear());
/** @returns Own current scope and a saved preview with one valid and one invalid record. */
function fixture() {
  const viewerId = randomUUID(), importId = randomUUID(), draft = { fileName: "synthetic.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre\ninvalid,Nombre" };
  const initialState: Extract<AllowlistImportPageState, { kind: "ready" }> = { kind: "ready", viewerId, tribeId: randomUUID(), slug: "synthetic", contactType: "email", policyVersion: 1, renderedAt: "2026-10-09T08:00:00Z" };
  const snapshot: AllowlistImportDto = { importId, state: "preview", sourceVersion: 1, expiresAt: "2026-10-10T08:00:00Z", counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: "Nombre", selected: false, errors: [] }, { rowNumber: 2, identity: "invalid", displayName: "Nombre", selected: false, errors: ["admission_contact_invalid"] }] };
  const client: AllowlistImportBrowserClient = { viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })), operation: vi.fn(), policy: vi.fn(), read: vi.fn(async () => ({ status: "ready" as const, value: snapshot })), write: vi.fn(async (_slug, intent) => ({ status: "ready" as const, value: { state: "completed" as const, operationId: intent.operationId, replayed: false, result: { importId, sourceVersion: 1, expiresAt: snapshot.expiresAt } } })), file: vi.fn() };
  return { initialState, client, importId, draft, snapshot, drafts: createAllowlistImportDraftStoreFixture() };
}

describe("explicit import workflow", () => {
  it("should restore an owned draft without consent, an upload POST or duplicate initial policy fetching", async () => {
    const data = fixture();
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: null, selection: [], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.draft).toMatchObject(data.draft); expect(result.current.confirmed).toBe(false);
    expect(data.client.write).not.toHaveBeenCalled(); expect(data.client.policy).not.toHaveBeenCalled(); expect(data.client.read).not.toHaveBeenCalled();
  });
  it("should preview without confirming any row and require an explicit valid pending selection", async () => {
    const data = fixture(), { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    expect(result.current.snapshot).toEqual(data.snapshot); expect(result.current.selection).toEqual([]); expect(result.current.confirmed).toBe(false);
    act(() => { result.current.selectRow(2, true); result.current.setConfirmed(true); });
    await act(async () => result.current.confirm());
    expect(result.current.fieldError).toBeTruthy(); expect(data.client.write).toHaveBeenCalledOnce();
  });
  it("should recover a lost preview reply by GET and retain its exact original without redispatch", async () => {
    const data = fixture(); vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "Respuesta perdida.", uncertain: true });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    const original = result.current.pending!;
    expect(original).toBeTruthy();
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "preview_allowlist_import", operationId: (original as { operationId: string }).operationId, state: "completed", replayed: true, result: { importId: data.importId, sourceVersion: 1, expiresAt: data.snapshot.expiresAt } } });
    await act(async () => result.current.readOriginal());
    expect(result.current.snapshot).toEqual(data.snapshot); expect(result.current.pending).toBeNull(); expect(result.current.draft).toMatchObject(data.draft);
    expect(data.client.write).toHaveBeenCalledOnce(); expect(data.client.operation).toHaveBeenCalledOnce();
  });
  it("should keep a conflicted selection and read the current version before a new explicit operation", async () => {
    const data = fixture();
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "allowlist_import_conflict", message: "La importación cambió.", uncertain: false });
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    expect(result.current.conflict).toBe(true); expect(result.current.selection).toEqual([1]); expect(result.current.confirmed).toBe(false);
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: { ...data.snapshot, sourceVersion: 2 } });
    await act(async () => result.current.readCurrent());
    expect(result.current.snapshot?.sourceVersion).toBe(2); expect(result.current.confirmed).toBe(false); expect(data.client.write).toHaveBeenCalledOnce();
  });
  it("should keep a committed row through unknown progress and resume only pending rows with a fresh explicit operation", async () => {
    const data = fixture(), operationId = randomUUID(), oldIntent = { type: "confirm_allowlist_import" as const, operationId, importId: data.importId, expectedVersion: 1, selectedRows: [1, 2] };
    const partial: AllowlistImportDto = { ...data.snapshot, state: "processing", sourceVersion: 3, counts: { selected: 2, added: 1, unchanged: 0, conflict: 0, skipped: 0 }, rows: [{ ...data.snapshot.rows[0], selected: true, outcome: "added", version: 1 }, { rowNumber: 2, identity: "pending@example.test", displayName: "Pendiente", selected: true, errors: [] }] };
    vi.mocked(data.client.read).mockResolvedValue({ status: "ready", value: partial });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "confirm_allowlist_import", operationId, state: "started" } });
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "dependency_unavailable", message: "Respuesta perdida.", uncertain: true });
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1, 2], pending: oldIntent, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.snapshot?.sourceVersion).toBe(3));
    expect(result.current.snapshot?.rows[0]).toMatchObject({ outcome: "added", version: 1 });
    await act(async () => result.current.readOriginal());
    expect(data.client.write).not.toHaveBeenCalled();
    expect(result.current.selection).toEqual([2]);
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    expect(data.client.write).toHaveBeenCalledOnce();
    const resumed = vi.mocked(data.client.write).mock.calls[0][1];
    expect(resumed).toMatchObject({ type: "confirm_allowlist_import", importId: data.importId, expectedVersion: 3, selectedRows: [2] }); expect(resumed.operationId).not.toBe(operationId);
    expect(result.current.unresolved).toEqual([oldIntent]); expect(result.current.snapshot?.rows[0]).toMatchObject({ outcome: "added", version: 1 });
  });
  it("should close both private rendering and new writes after current import read detects lost leadership", async () => {
    const data = fixture();
    vi.mocked(data.client.read).mockResolvedValue({ status: "failed", code: "permission_denied", message: "Sin acceso.", uncertain: false });
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.privateVisible).toBe(false));
    expect(result.current.ready).toBe(false); expect(result.current.snapshot).toBeNull(); expect(data.client.write).not.toHaveBeenCalled();
  });
});
