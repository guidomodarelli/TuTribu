/** Defines browser-owned file storage independently of Web Storage metadata or HTTP. @module allowlist-import-draft-store */
import type { AllowlistImportDraft } from "../commands/allowlist-import-browser-intent";

/** This opaque id belongs to the local browser, never a provider or server file. */
export type SavedAllowlistImportDraft = AllowlistImportDraft & { draftId: string };
export interface AllowlistImportDraftStore {
  save(viewerId: string, slug: string, draft: AllowlistImportDraft, signal: AbortSignal): Promise<SavedAllowlistImportDraft>;
  load(viewerId: string, slug: string, draftId: string, signal: AbortSignal): Promise<SavedAllowlistImportDraft | null>;
  remove(draftId: string): Promise<void>;
}
