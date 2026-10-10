/** Separates immutable completed originals from temporary import resource retention. @module allowlist-import-expiration-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import { writeAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import { ALLOWLIST_BROWSER_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { createAllowlistImportDraftStoreFixture } from "@/tests/support/allowlist-import-draft-store-fixture";

afterEach(() => { window.sessionStorage.clear(); vi.useRealTimers(); });
describe("historical import recovery after retention", () => {
  it("should finish a genuinely completed preview even when its temporary rows are no longer available, without another POST", async () => {
    const viewerId = randomUUID(), importId = randomUUID(), operationId = randomUUID(), draft = { fileName: "old.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre" };
    const initialState: AllowlistImportPageState = { kind: "ready", viewerId, tribeId: randomUUID(), slug: "synthetic", contactType: "email", policyVersion: 1, renderedAt: "2026-10-09T08:00:00Z" };
    const client: AllowlistImportBrowserClient = { viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })), read: vi.fn(async () => ({ status: "failed" as const, code: "resource_unavailable" as const, message: "La importación ya no está disponible.", uncertain: false })), operation: vi.fn(async () => ({ status: "ready" as const, value: { type: "preview_allowlist_import" as const, operationId, state: "completed" as const, replayed: true, result: { importId, sourceVersion: 1, expiresAt: "2026-10-08T08:00:00Z" } } })), write: vi.fn(), policy: vi.fn(), file: vi.fn() };
    const drafts = createAllowlistImportDraftStoreFixture(), saved = await drafts.save(viewerId, "synthetic", draft, new AbortController().signal);
    writeAllowlistImport({ viewerId, slug: "synthetic", draft: saved, importId: null, selection: [], pending: { type: "preview_allowlist_import", operationId, expectedPolicyVersion: 1, contactType: "email" }, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow({ initialState, client, drafts }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.readOriginal());
    expect(result.current.pending).toBeNull(); expect(result.current.snapshot).toBeNull(); expect(client.write).not.toHaveBeenCalled();
    await act(async () => result.current.changeDraft({ ...draft, fileName: "new.csv" }));
    expect(result.current.draft?.fileName).toBe("new.csv"); expect(result.current.confirmed).toBe(false);
  });
  it("should end an active initialization deadline with visible feedback rather than leaving disabled controls indefinitely", async () => {
    vi.useFakeTimers();
    const initialState: AllowlistImportPageState = { kind: "ready", viewerId: randomUUID(), tribeId: randomUUID(), slug: "synthetic", contactType: "email", policyVersion: 1, renderedAt: "2026-10-09T08:00:00Z" };
    const client: AllowlistImportBrowserClient = { viewer: vi.fn<AllowlistImportBrowserClient["viewer"]>(async (signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ status: "aborted" }), { once: true }))), read: vi.fn(), operation: vi.fn(), write: vi.fn(), policy: vi.fn(), file: vi.fn() };
    const { result } = renderHook(() => useAllowlistImportWorkflow({ initialState, client }));
    await act(async () => { await vi.advanceTimersByTimeAsync(ALLOWLIST_BROWSER_TIMEOUT_MS + 1); });
    expect(result.current.ready).toBe(false); expect(result.current.errorMessage).toBeTruthy(); expect(client.write).not.toHaveBeenCalled();
    vi.mocked(client.viewer).mockResolvedValue({ status: "ready", value: { id: initialState.viewerId } });
    await act(async () => { result.current.retryInitialization(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.ready).toBe(true); expect(result.current.errorMessage).toBeNull(); expect(client.write).not.toHaveBeenCalled();
  });
});
