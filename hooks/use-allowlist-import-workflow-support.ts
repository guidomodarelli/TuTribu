/** Pure decisions of the allowlist import workflow, kept apart so each hook step stays readable. @module use-allowlist-import-workflow-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WriteToast } from "@/lib/toasts/write-toast";
import type { AllowlistImportPageState } from "@/src/modules/academy-admissions/application/results/allowlist-import-page-state";
import type { AllowlistImportBrowserIntent } from "@/src/modules/academy-admissions/application/commands/allowlist-import-browser-intent";
import { allowlistImportReferenceSchema, allowlistImportConfirmationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-import-operation-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
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

/** @param code - Failure code of a denial or a failed write. @returns Whether it keeps the flow blocked on screen. */
export function isBlockingImportFailure(code: string): boolean {
  return code === ADMISSION_ERROR_CODE.allowlistImportConflict || code === ADMISSION_ERROR_CODE.policyConflict;
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
  return stored.pending ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable;
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
