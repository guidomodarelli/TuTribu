/** Exercises explicit import UI actions through owned ports with real React and stored intent guards. @module use-allowlist-import-workflow-tests */
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { ThemedToaster } from "@golfo/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportDto } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { createAllowlistImportDraftStoreFixture } from "@/tests/support/allowlist-import-draft-store-fixture";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ALLOWLIST_IMPORT_WRITE_ACTION, ALLOWLIST_IMPORT_BROWSER_COPY, ALLOWLIST_IMPORT_STEP } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { readAllowlistImport, writeAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { PLATFORM_SECURITY_NOTICE_COPY } from "@/src/modules/academy-admissions/constants/platform-security-notice";

afterEach(() => window.sessionStorage.clear());
/** @returns Own current scope and a saved preview with one valid and one invalid record. */
function fixture() {
  const viewerId = randomUUID(), importId = randomUUID(), draft = { fileName: "synthetic.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre\ninvalid,Nombre" };
  const now = Date.now();
  const initialState: Extract<AllowlistImportPageState, { kind: "ready" }> = { kind: "ready", viewerId, tribeId: randomUUID(), slug: "synthetic", contactType: "email", policyVersion: 1, platformRequirement: null, renderedAt: new Date(now).toISOString() };
  const snapshot: AllowlistImportDto = { importId, state: "preview", sourceVersion: 1, expiresAt: new Date(now + ADMISSION_LIMIT.csvRetentionMs).toISOString(), counts: { selected: 0, added: 0, unchanged: 0, skipped: 0, conflict: 0 }, rows: [{ rowNumber: 1, identity: "synthetic@example.test", displayName: "Nombre", selected: false, errors: [] }, { rowNumber: 2, identity: "invalid", displayName: "Nombre", selected: false, errors: ["admission_contact_invalid"] }] };
  /** Current rules read: the saved email rules, with no platform requirement unless a test names one. */
  const policy: AdmissionPolicyStateDto = { state: "not_configured", controlActivated: false, policy: null, usage: null, preparation: { state: "not_evaluated", requirements: ["policy_unavailable"] }, impact: { pendingRequestCount: 0, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } };
  const client: AllowlistImportBrowserClient = { viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })), operation: vi.fn(), policy: vi.fn<AllowlistImportBrowserClient["policy"]>(async () => ({ status: "ready", value: policy })), read: vi.fn(async () => ({ status: "ready" as const, value: snapshot })), write: vi.fn(async (_slug, intent) => ({ status: "ready" as const, value: { state: "completed" as const, operationId: intent.operationId, replayed: false, result: { importId, sourceVersion: 1, expiresAt: snapshot.expiresAt } } })), file: vi.fn() };
  return { initialState, client, importId, draft, snapshot, policy, drafts: createAllowlistImportDraftStoreFixture() };
}

/** @param props - Hook host. @returns The real toaster beside it, where write outcomes are announced. */
function WithToaster({ children }: { children: ReactNode }) { return <>{children}<ThemedToaster /></>; }

describe("explicit import workflow", () => {
  it("should open the review step only after the preview write lands and announce it once in its toast", async () => {
    const data = fixture(), { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.step).toBe(ALLOWLIST_IMPORT_STEP.upload);
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    expect(result.current.step).toBe(ALLOWLIST_IMPORT_STEP.review);
    expect(await screen.findByText(ALLOWLIST_IMPORT_BROWSER_COPY.previewed)).toBeInTheDocument();
    expect(result.current.statusMessage).toBeNull();
  });
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
  it("should name only the pending server write, never a read, as the action in progress", async () => {
    const data = fixture(); let resolveWrite!: (value: Awaited<ReturnType<AllowlistImportBrowserClient["write"]>>) => void;
    vi.mocked(data.client.write).mockImplementationOnce(async () => new Promise((resolve) => { resolveWrite = resolve; }));
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft));
    expect(result.current.writeAction).toBeNull();
    act(() => result.current.setConfirmed(true));
    let preview!: Promise<void>; act(() => { preview = result.current.preview(); });
    await waitFor(() => expect(data.client.write).toHaveBeenCalledOnce());
    expect(result.current.busy).toBe(true); expect(result.current.writeAction).toBe(ALLOWLIST_IMPORT_WRITE_ACTION.preview);
    const intent = vi.mocked(data.client.write).mock.calls[0][1];
    await act(async () => { resolveWrite({ status: "ready", value: { state: "completed", operationId: intent.operationId, replayed: false, result: { importId: data.importId, sourceVersion: 1, expiresAt: data.snapshot.expiresAt } } }); await preview; });
    expect(result.current.busy).toBe(false); expect(result.current.writeAction).toBeNull();
    let resolveRead!: (value: Awaited<ReturnType<AllowlistImportBrowserClient["read"]>>) => void;
    vi.mocked(data.client.read).mockImplementationOnce(async () => new Promise((resolve) => { resolveRead = resolve; }));
    let read!: Promise<void>; act(() => { read = result.current.readCurrent(); });
    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(result.current.writeAction).toBeNull();
    await act(async () => { resolveRead({ status: "ready", value: data.snapshot }); await read; });
    expect(data.client.write).toHaveBeenCalledOnce();
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
  it("should lift or impose the platform block in the same session when the progress recheck rereads the rules", async () => {
    const data = fixture(); data.initialState.platformRequirement = "recovery_locked";
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.policy.platformRequirement).toBe("recovery_locked");
    await act(async () => result.current.readCurrent());
    expect(result.current.policy).toEqual({ contactType: "email", version: 1, platformRequirement: null });
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    expect(data.client.write).toHaveBeenCalledOnce();
    vi.mocked(data.client.policy).mockResolvedValueOnce({ status: "ready", value: { ...data.policy, preparation: { state: "not_evaluated", requirements: ["policy_unavailable", "admission_security_unconfigured"] } } });
    await act(async () => result.current.readCurrent());
    expect(result.current.policy.platformRequirement).toBe("security_unconfigured");
    expect(data.client.policy).toHaveBeenCalledTimes(2);
  });
  it("should let a first import recheck the platform block without any saved preview and start once it is lifted", async () => {
    const data = fixture(); data.initialState.platformRequirement = "security_unconfigured";
    const blocked: AdmissionPolicyStateDto = { ...data.policy, preparation: { state: "not_evaluated", requirements: ["policy_unavailable", "admission_security_unconfigured"] } };
    vi.mocked(data.client.policy).mockResolvedValueOnce({ status: "ready", value: blocked });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.hasSavedImport).toBe(false);
    await act(async () => result.current.recheckPlatform());
    expect(result.current.policy.platformRequirement).toBe("security_unconfigured");
    expect(await screen.findByText(PLATFORM_SECURITY_NOTICE_COPY.rechecked)).toBeInTheDocument();
    await act(async () => result.current.recheckPlatform());
    expect(result.current.policy).toEqual({ contactType: "email", version: 1, platformRequirement: null });
    expect(data.client.read).not.toHaveBeenCalled();
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    expect(vi.mocked(data.client.write).mock.calls.at(-1)?.[1]).toMatchObject({ type: "preview_allowlist_import" });
  });
  it("should still reread the platform requirement when the progress recheck finds the saved import expired", async () => {
    const data = fixture(); data.initialState.platformRequirement = "recovery_locked";
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    vi.mocked(data.client.read).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: ADMISSION_ERROR_MESSAGE.resource_unavailable, uncertain: false });
    await act(async () => result.current.readCurrent());
    expect(result.current.hasSavedImport).toBe(false);
    expect(result.current.policy.platformRequirement).toBeNull();
    expect(data.client.policy).toHaveBeenCalledOnce();
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
  it("should ask for a new preview when the saved import can no longer be confirmed instead of leaving it unusable", async () => {
    const data = fixture();
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    // A rotated hosting security (or an expired preview) closes this import for good: the server answers resource_unavailable.
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: ADMISSION_ERROR_MESSAGE.resource_unavailable, uncertain: false });
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    expect(result.current.errorMessage).toBe(ALLOWLIST_IMPORT_BROWSER_COPY.previewUnavailable);
    expect(result.current.snapshot).toBeNull(); expect(result.current.hasSavedImport).toBe(false); expect(result.current.step).toBe(ALLOWLIST_IMPORT_STEP.upload);
    expect(result.current.pending).toBeNull(); expect(result.current.draft).toMatchObject(data.draft);
    // The kept file previews again as a new original.
    vi.mocked(data.client.write).mockImplementation(async (_slug, intent) => ({ status: "ready" as const, value: { state: "completed" as const, operationId: intent.operationId, replayed: false, result: { importId: data.importId, sourceVersion: 1, expiresAt: data.snapshot.expiresAt } } }));
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.preview());
    expect(vi.mocked(data.client.write).mock.calls.at(-1)?.[1]).toMatchObject({ type: "preview_allowlist_import" });
    expect(result.current.snapshot).toEqual(data.snapshot);
  });
  it("should release a preview the platform could not protect and keep the platform copy on screen", async () => {
    const data = fixture(), code = ADMISSION_ERROR_CODE.platformSecurityUnavailable;
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain: false });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    expect(result.current.pending).toBeNull(); expect(result.current.errorMessage).toBe(ADMISSION_ERROR_MESSAGE[code]);
    expect((await readAllowlistImport(data.initialState.viewerId, "synthetic", { files: data.drafts }))?.pending).toBeNull();
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.preview());
    const [first, second] = vi.mocked(data.client.write).mock.calls.map(([, intent]) => intent.operationId);
    expect(second).toBeDefined(); expect(second).not.toBe(first); expect(data.client.operation).not.toHaveBeenCalled();
  });
  it("should discard only an original the server proves absent and keep the file", async () => {
    const data = fixture();
    vi.mocked(data.client.write).mockResolvedValue({ status: "failed", code: "unexpected_failure", message: "Sin confirmar.", uncertain: true });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: "Recurso no disponible.", uncertain: false });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    expect(result.current.pending).not.toBeNull(); expect(result.current.originalAbsent).toBe(false);
    act(() => result.current.discardOriginal());
    expect(result.current.pending).not.toBeNull();
    await act(async () => result.current.readOriginal());
    expect(result.current.errorMessage).toBe(ALLOWLIST_IMPORT_BROWSER_COPY.absent); expect(result.current.originalAbsent).toBe(true);
    act(() => result.current.discardOriginal());
    expect(result.current.pending).toBeNull(); expect(result.current.originalAbsent).toBe(false); expect(result.current.draft).toMatchObject(data.draft);
    expect(await screen.findByText(ALLOWLIST_IMPORT_BROWSER_COPY.discarded)).toBeInTheDocument();
    expect(data.client.write).toHaveBeenCalledOnce();
  });
  it("should resend an absent preview with the same original and file, and discard a started one without the list changing", async () => {
    const data = fixture();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "unexpected_failure", message: "Sin confirmar.", uncertain: true });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: "Recurso no disponible.", uncertain: false });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    const original = result.current.pending!;
    expect(result.current.pendingPreview).toBe(true); expect(result.current.originalRetryable).toBe(false);
    await act(async () => result.current.readOriginal());
    expect(result.current.originalRetryable).toBe(true);
    await act(async () => result.current.retryOriginal());
    const [first, second] = vi.mocked(data.client.write).mock.calls;
    expect(second[1]).toEqual(first[1]); expect(second[2]).toMatchObject(data.draft); expect(second[1]).toEqual(original);
    expect(result.current.pending).toBeNull(); expect(result.current.snapshot).toEqual(data.snapshot); expect(result.current.originalRetryable).toBe(false);
  });
  it("should let the leader discard a preview that stays started, since a preview never changes the list", async () => {
    const data = fixture();
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code: "unexpected_failure", message: "Sin confirmar.", uncertain: true });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.changeDraft(data.draft)); act(() => result.current.setConfirmed(true));
    await act(async () => result.current.preview());
    const original = result.current.pending!;
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "preview_allowlist_import", operationId: original.operationId, state: "started" } });
    await act(async () => result.current.readOriginal());
    expect(result.current.errorMessage).toBe(ALLOWLIST_IMPORT_BROWSER_COPY.started);
    expect(result.current.originalRetryable).toBe(true); expect(result.current.previewDiscardable).toBe(true); expect(result.current.originalAbsent).toBe(false);
    act(() => result.current.discardOriginal());
    expect(result.current.pending).toBeNull(); expect(result.current.draft).toMatchObject(data.draft); expect(data.client.write).toHaveBeenCalledOnce();
  });
  it("should resend a started confirmation as is so its remaining rows finish without a new original", async () => {
    const data = fixture(), operationId = randomUUID(), intent = { type: "confirm_allowlist_import" as const, operationId, importId: data.importId, expectedVersion: 1, selectedRows: [1] };
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: intent, unresolved: [] });
    vi.mocked(data.client.operation).mockResolvedValue({ status: "ready", value: { type: "confirm_allowlist_import", operationId, state: "started" } });
    vi.mocked(data.client.write).mockResolvedValue({ status: "ready", value: { state: "completed", operationId, replayed: false, result: { importId: data.importId, sourceVersion: 2, state: "completed", counts: { selected: 1, added: 1, unchanged: 0, skipped: 0, conflict: 0 } } } });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    await act(async () => result.current.readOriginal());
    expect(result.current.originalRetryable).toBe(true);
    await act(async () => result.current.retryOriginal());
    expect(vi.mocked(data.client.write).mock.calls[0][1]).toEqual(intent);
    expect(result.current.pending).toBeNull(); expect(result.current.unresolved).toEqual([]);
  });
  it("should mark a preview made for an older rules version unusable and ask to reread the rules before a new preview", async () => {
    const data = fixture(), code = ADMISSION_ERROR_CODE.policyConflict;
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    // The server records the denial and answers it as a definitive 409.
    vi.mocked(data.client.write).mockResolvedValueOnce({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain: false });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    expect(result.current.errorMessage).toBe(ALLOWLIST_IMPORT_BROWSER_COPY.policyConflict); expect(result.current.policyConflict).toBe(true);
    expect(result.current.snapshot).toBeNull(); expect(result.current.hasSavedImport).toBe(false); expect(result.current.step).toBe(ALLOWLIST_IMPORT_STEP.upload);
    // The same preview is never confirmed again: a new preview waits for the current rules.
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.preview());
    expect(data.client.write).toHaveBeenCalledOnce();
    vi.mocked(data.client.policy).mockResolvedValue({ status: "ready", value: { ...data.policy, policy: { contactType: "email", version: 2 } } as typeof data.policy });
    await act(async () => result.current.readPolicy());
    expect(result.current.policyConflict).toBe(false); expect(result.current.policy.version).toBe(2);
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.preview());
    expect(vi.mocked(data.client.write).mock.calls[1][1]).toMatchObject({ type: "preview_allowlist_import", expectedPolicyVersion: 2 });
  });
  it("should let the leader close an expired import whose confirmations can no longer finish and choose another file", async () => {
    const data = fixture(), previous = { type: "confirm_allowlist_import" as const, operationId: randomUUID(), importId: data.importId, expectedVersion: 1, selectedRows: [1] };
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [previous] });
    vi.mocked(data.client.read).mockResolvedValue({ status: "failed", code: "resource_unavailable", message: ADMISSION_ERROR_MESSAGE.resource_unavailable, uncertain: false });
    const { result } = renderHook(() => useAllowlistImportWorkflow(data), { wrapper: WithToaster });
    await waitFor(() => expect(result.current.importUnusable).toBe(true));
    expect(result.current.snapshot).toBeNull(); expect(result.current.hasSavedImport).toBe(true); expect(result.current.unresolved).toEqual([previous]);
    act(() => result.current.closeUnusableImport());
    expect(result.current.importUnusable).toBe(false); expect(result.current.unresolved).toEqual([]); expect(result.current.hasSavedImport).toBe(false);
    expect(result.current.draft).toMatchObject(data.draft); expect(result.current.step).toBe(ALLOWLIST_IMPORT_STEP.upload);
    expect((await readAllowlistImport(data.initialState.viewerId, "synthetic", { files: data.drafts }))?.unresolved).toEqual([]);
    expect(await screen.findByText(ALLOWLIST_IMPORT_BROWSER_COPY.importClosed)).toBeInTheDocument();
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.preview());
    expect(vi.mocked(data.client.write).mock.calls[0][1]).toMatchObject({ type: "preview_allowlist_import" });
  });
  it("should not dispatch a preview or a confirmation while the read reports a platform requirement", async () => {
    const data = fixture(), initialState = { ...data.initialState, platformRequirement: "recovery_locked" as const };
    const saved = await data.drafts.save(data.initialState.viewerId, "synthetic", data.draft, new AbortController().signal);
    writeAllowlistImport({ viewerId: data.initialState.viewerId, slug: "synthetic", draft: saved, importId: data.importId, selection: [1], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow({ ...data, initialState }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    act(() => result.current.setConfirmed(true)); await act(async () => result.current.confirm());
    await act(async () => result.current.preview());
    expect(data.client.write).not.toHaveBeenCalled(); expect(result.current.policy.platformRequirement).toBe("recovery_locked");
  });
});
