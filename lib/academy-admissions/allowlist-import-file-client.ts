"use client";
/** Reads untrusted file bytes through a cancellable browser boundary and the actual CSV input grammar. @module allowlist-import-file-client */
import type { AllowlistImportDraft } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { parseAllowlistCsv } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-csv-parser";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ALLOWLIST_CSV_ENCODING } from "@/src/modules/academy-admissions/constants/allowlist-import";
import { ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS, ALLOWLIST_IMPORT_DOWNLOAD_RETENTION_MS } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";

/** @param csvText - A restored or explicitly chosen proposal. @returns Global grammar row count, or null before any HTTP mutation for invalid input. */
export function countAllowlistImportRows(csvText: string): number | null { try { return parseAllowlistCsv(csvText).length; } catch { return null; } }
/** @param blob - Guarded own private CSV. @param fileName - Static download name. @param completed - Owner cleanup callback. @returns Cleanup for navigation; URL stays alive long enough for WebKit download. */
export function downloadAllowlistImportFile(blob: Blob, fileName: string, completed: () => void): () => void {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.rel = "noopener"; document.body.append(anchor); anchor.click(); anchor.remove();
  const cleanup = () => { window.clearTimeout(timer); URL.revokeObjectURL(url); completed(); };
  const timer = window.setTimeout(cleanup, ALLOWLIST_IMPORT_DOWNLOAD_RETENTION_MS);
  return cleanup;
}

/** @param file - Explicit browser-selected file. @param signal - Current upload scope. @returns A valid global file proposal, controlled invalidity or intentional cancellation. */
export async function readAllowlistImportFile(file: File, signal: AbortSignal): Promise<{ status: "ready"; draft: AllowlistImportDraft; rowCount: number } | { status: "invalid" } | { status: "aborted" }> {
  if (signal.aborted) return { status: "aborted" };
  if (file.size > ADMISSION_LIMIT.csvByteCount) return { status: "invalid" };
  try {
    const bytes = await new Promise<ArrayBuffer | null>((resolve) => {
      const reader = new FileReader();
      const cleanup = () => { signal.removeEventListener("abort", abort); reader.onload = null; reader.onerror = null; reader.onabort = null; };
      const abort = () => { reader.abort(); cleanup(); resolve(null); };
      reader.onload = () => { const value = reader.result; cleanup(); resolve(value instanceof ArrayBuffer ? value : null); };
      reader.onerror = () => { cleanup(); resolve(null); };
      reader.onabort = () => { cleanup(); resolve(null); };
      signal.addEventListener("abort", abort, { once: true });
      reader.readAsArrayBuffer(file);
    });
    if (signal.aborted) return { status: "aborted" };
    if (!bytes) return { status: "invalid" };
    const rows = parseAllowlistCsv(new Uint8Array(bytes));
    return { status: "ready", draft: { fileName: file.name.slice(0, ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS), csvText: new TextDecoder(ALLOWLIST_CSV_ENCODING, { fatal: true }).decode(bytes) }, rowCount: rows.length };
  } catch { return signal.aborted ? { status: "aborted" } : { status: "invalid" }; }
}
