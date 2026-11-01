/** Pure decisions of the allowlist import workflow, kept apart so each hook step stays readable. @module use-allowlist-import-workflow-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { BROWSER_REQUEST_TRANSPORT_MESSAGE } from "@/src/constants/browser-request";
import type { WriteToast } from "@/lib/toasts/write-toast";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserIntent } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { allowlistImportReferenceSchema, allowlistImportConfirmationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-import-operation-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION as OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ALLOWLIST_IMPORT_BROWSER_COPY as COPY, type AllowlistImportWriteAction } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import type { StoredAllowlistImport } from "@/lib/academy-admissions/allowlist-import-intent";

/** The SSR scope the workflow can act on. */
export type ReadyAllowlistImportState = Extract<AllowlistImportPageState, { kind: "ready" }>;

/** @param initial - Ready scope, or null when the page is unavailable. @returns The same scope; the hook only reaches its writes through a ready scope, so a missing one fails like reading `null`. */
export function requireReadyScope(initial: ReadyAllowlistImportState | null): ReadyAllowlistImportState {
  if (!initial) throw new TypeError("AllowlistImport: ready scope unavailable");
  return initial;
}

/**
 * @param code - Failure code of a denial or a failed write.
 * @returns Whether it keeps the flow blocked on screen: a conflict to consult, or a platform block only the TuTribu team can lift.
 */
export function isBlockingImportFailure(code: string): boolean {
  return code === ADMISSION_ERROR_CODE.allowlistImportConflict || code === ADMISSION_ERROR_CODE.policyConflict || code === ADMISSION_ERROR_CODE.platformSecurityUnavailable;
}

/**
 * A preview is bound to the rules version it was created with, so a confirmation rejected for a rules change can never succeed either.
 * @param intent - Dispatched original. @param code - Its denial or definitive failure.
 * @returns Whether the saved import can no longer be confirmed, so the leader needs a new preview.
 */
export function isUnusableImportConfirmation(intent: AllowlistImportBrowserIntent, code: string): boolean {
  return intent.type === OPERATION.confirmAllowlistImport && (code === ADMISSION_ERROR_CODE.resourceUnavailable || code === ADMISSION_ERROR_CODE.policyConflict);
}

/** @param code - Why a confirmation can no longer be applied. @returns What the leader reads: reread the rules for a rules change, or create a new preview otherwise. */
export function unusableImportMessage(code: string): string {
  return code === ADMISSION_ERROR_CODE.policyConflict ? COPY.policyConflict : COPY.previewUnavailable;
}

/** @param stored - Current own records. @returns Whether confirmations still reference the saved import, so it cannot be forgotten silently. */
export function hasImportOriginals(stored: StoredAllowlistImport): boolean {
  return stored.unresolved.length > 0 || stored.pending?.type === OPERATION.confirmAllowlistImport;
}

/**
 * @param stored - Current own records. @param retryableOriginalId - Pending original that last answered `started` or absent.
 * @returns The pending original that may be resent as is, or null; a preview resends its file, so without the local copy only
 * discarding it remains.
 */
export function readRetryableOriginal(stored: StoredAllowlistImport, retryableOriginalId: string | null): AllowlistImportBrowserIntent | null {
  const pending = stored.pending?.operationId === retryableOriginalId ? stored.pending : null;
  if (!pending) return null;
  return pending.type === OPERATION.previewAllowlistImport && !stored.draft ? null : pending;
}

/**
 * @param stored - Current own records. @param retryableOriginalId - Pending original that last answered `started` or absent.
 * @returns The pending preview that may be discarded (a preview never changes the list), or null.
 */
export function readDiscardablePreviewId(stored: StoredAllowlistImport, retryableOriginalId: string | null): string | null {
  return stored.pending?.type === OPERATION.previewAllowlistImport && stored.pending.operationId === retryableOriginalId ? retryableOriginalId : null;
}

/** @param intent - Dispatched original. @param result - Unvalidated completed result. @returns The reference the original confirmed, or null when it cannot belong to it. */
export function readUsableWriteResult(intent: AllowlistImportBrowserIntent, result: unknown) {
  const parsed = intent.type === OPERATION.previewAllowlistImport ? allowlistImportReferenceSchema.safeParse(result) : allowlistImportConfirmationResultSchema.safeParse(result);
  if (!parsed.success) return null;
  if (intent.type === OPERATION.previewAllowlistImport) return parsed.data.sourceVersion === 1 ? parsed.data : null;
  const stale = parsed.data.importId !== intent.importId || parsed.data.sourceVersion < intent.expectedVersion;
  return stale ? null : parsed.data;
}

/** @param stored - Current own records. @returns The failure copy of an interrupted action: uncertain while an original is pending. */
export function interruptedActionMessage(stored: StoredAllowlistImport): string {
  return stored.pending ? COPY.uncertain : BROWSER_REQUEST_TRANSPORT_MESSAGE;
}

/** Refs and setters an action run releases when it settles. */
export type AllowlistImportRunRelease = {
  controllerRef: RefObject<AbortController | null>;
  occupiedRef: RefObject<boolean>;
  activeRef: RefObject<boolean>;
  generationRef: RefObject<number>;
  writeToastRef: RefObject<WriteToast | null>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setWriteAction: Dispatch<SetStateAction<AllowlistImportWriteAction | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
};

/** One settled action run. */
export type AllowlistImportSettledRun = { next: AbortController; scope: number; message: string; notice: WriteToast | null; fail: (failure: string) => void; currentRef: RefObject<StoredAllowlistImport> };

/** @param release - Workflow refs and setters. @param settled - The run that ended. Frees the workflow only when this run still owns it and reports a timeout. */
export function releaseAllowlistImportRun(release: AllowlistImportRunRelease, settled: AllowlistImportSettledRun): void {
  const { next, scope, message, notice, fail, currentRef } = settled;
  if (release.controllerRef.current === next) {
    release.occupiedRef.current = false; release.controllerRef.current = null;
    if (release.activeRef.current && release.generationRef.current === scope) {
      release.setBusy(false); release.setWriteAction(null); release.setStatusMessage((currentMessage) => currentMessage === message ? null : currentMessage);
      if (next.signal.aborted) fail(interruptedActionMessage(currentRef.current));
    }
  }
  if (release.writeToastRef.current === notice) release.writeToastRef.current = null;
  notice?.finish();
}

/** Refs that scope one mounted hydration. */
export type AllowlistImportScopeRefs = Pick<AllowlistImportRunRelease, "activeRef" | "generationRef" | "controllerRef" | "occupiedRef">;

/** @param refs - Workflow scope refs. @param hydration - The scope's own hydration. Ends the scope: later replies are ignored and whichever action is running now is cancelled. */
export function closeAllowlistImportScope(refs: AllowlistImportScopeRefs, hydration: AbortController): void {
  refs.activeRef.current = false; refs.generationRef.current += 1; hydration.abort(); refs.controllerRef.current?.abort(); refs.occupiedRef.current = false;
}
