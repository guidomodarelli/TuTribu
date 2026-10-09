/** Exercises account changes during local draft restoration through the owned async file port. @module allowlist-import-draft-hydration-tests */
import { randomUUID } from "node:crypto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowlistImportWorkflow } from "@/hooks/use-allowlist-import-workflow";
import { writeAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";
import { createAllowlistImportDraftStoreFixture } from "@/tests/support/allowlist-import-draft-store-fixture";
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { SavedAllowlistImportDraft } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";

afterEach(() => window.sessionStorage.clear());
describe("private local draft restoration", () => {
  it("should reject a late draft for account A after the native viewer changes to B while storage is loading", async () => {
    const viewerId = randomUUID(), initialState: AllowlistImportPageState = { kind: "ready", viewerId, tribeId: randomUUID(), slug: "synthetic", policyVersion: 1, contactType: "email", renderedAt: "2026-10-09T08:00:00Z" };
    const drafts = createAllowlistImportDraftStoreFixture(), saved = await drafts.save(viewerId, "synthetic", { fileName: "private-account-a.csv", csvText: "identity,display_name\nsynthetic@example.test,Nombre" }, new AbortController().signal);
    let publish: (draft: SavedAllowlistImportDraft) => void = () => {};
    const load = vi.spyOn(drafts, "load").mockImplementation(async () => new Promise((resolve) => { publish = resolve; }));
    const client: AllowlistImportBrowserClient = { viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })), read: vi.fn(), write: vi.fn(), operation: vi.fn(), policy: vi.fn(), file: vi.fn() };
    writeAllowlistImport({ viewerId, slug: "synthetic", draft: saved, importId: null, selection: [], pending: null, unresolved: [] });
    const { result } = renderHook(() => useAllowlistImportWorkflow({ initialState, client, drafts }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    vi.mocked(client.viewer).mockResolvedValue({ status: "ready", value: { id: randomUUID() } });
    await act(async () => publish(saved));
    expect(result.current.privateVisible).toBe(false); expect(result.current.ready).toBe(false); expect(result.current.draft).toBeNull(); expect(client.write).not.toHaveBeenCalled();
  });
});
