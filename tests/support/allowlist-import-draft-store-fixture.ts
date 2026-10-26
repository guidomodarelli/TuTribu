/** Supplies an in-memory own file-storage port; native IndexedDB is exercised by the actual browser suite. @module allowlist-import-draft-store-fixture */
import { randomUUID } from "node:crypto";
import type { AllowlistImportDraftStore, SavedAllowlistImportDraft } from "@/src/modules/academy-admissions/application/ports/allowlist-import-draft-store";

/** @returns An owned local persistence edge, without replacing FileReader, validators, UI or IndexedDB platform code. */
export function createAllowlistImportDraftStoreFixture(): AllowlistImportDraftStore {
  const records = new Map<string, { viewerId: string; slug: string; draft: SavedAllowlistImportDraft }>();
  return {
    save: async (viewerId, slug, draft, signal) => { if (signal.aborted) throw new Error("Owned draft scope cancelled"); const saved = { ...draft, draftId: randomUUID() }; records.set(saved.draftId, { viewerId, slug, draft: saved }); return saved; },
    load: async (viewerId, slug, draftId, signal) => { const record = records.get(draftId); return !signal.aborted && record?.viewerId === viewerId && record.slug === slug ? record.draft : null; },
    remove: async (draftId) => { records.delete(draftId); },
  };
}
