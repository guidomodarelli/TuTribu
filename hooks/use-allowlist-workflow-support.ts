/** Pure decisions of the allowlist workflow, kept apart so each hook step stays readable. @module use-allowlist-workflow-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { BROWSER_REQUEST_TIMEOUT_MESSAGE } from "@/src/constants/browser-request";
import type { WriteToast } from "@/lib/toasts/write-toast";
import type { AllowlistPageState, AllowlistBrowserQuery } from "@/src/modules/academy-admissions/application/results/allowlist-page-state";
import type { AllowlistBrowserResult } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import type { AllowlistDraft, AllowlistBrowserIntent } from "@/src/modules/academy-admissions/application/commands/allowlist-browser-intent";
import type { AllowlistEntryResult } from "@/src/modules/academy-admissions/application/results/admission-resource-result";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "@/src/modules/academy-admissions/domain/value-objects/allowlist-display-name";
import { ALLOWLIST_BROWSER_PHASE as PHASE, ALLOWLIST_BROWSER_COPY as COPY } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { allowlistMutationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";

/** The SSR scope the workflow can act on. */
export type ReadyAllowlistState = Extract<AllowlistPageState, { kind: "ready" }>;
/** One shown page of entries. */
export type AllowlistShownPage = ReadyAllowlistState["page"];
/** Visible workflow phase. */
export type AllowlistPhase = typeof PHASE[keyof typeof PHASE];

/** @param initial - Ready scope, or null when the page is unavailable. @returns The same scope; actions only run through a ready scope, so a missing one fails like reading `null`. */
export function requireReadyAllowlist(initial: ReadyAllowlistState | null): ReadyAllowlistState {
  if (!initial) throw new TypeError("Allowlist: ready scope unavailable");
  return initial;
}

/** @param current - Shown page. @param entry - Current own entry. @param query - Shown filters. @returns The page with that entry updated, added or removed; historical versions never replace newer metadata. */
export function mergeAllowlistEntryIntoPage(current: AllowlistShownPage, entry: AllowlistEntryResult, query: AllowlistBrowserQuery): AllowlistShownPage {
  const existing = current.items.find((item) => item.id === entry.id);
  if (existing && existing.version > entry.version) return current;
  const searchTerm = query.search?.toLowerCase();
  const matches = (!query.status || entry.status === query.status) && (!searchTerm || entry.identity.toLowerCase().includes(searchTerm) || (entry.displayName ?? "").toLowerCase().includes(searchTerm));
  const remaining = current.items.filter((item) => item.id !== entry.id);
  if (matches && !existing && (query.cursor || current.items.length >= query.limit)) return current;
  if (!matches) return { ...current, items: remaining };
  if (existing) return { ...current, items: current.items.map((item) => item.id === entry.id ? entry : item) };
  return { ...current, items: [entry, ...remaining] };
}

/** @param intent - Dispatched original. @param result - Unvalidated completed result. @returns The confirmed result, or null when it cannot belong to that original. */
export function readUsableMutationResult(intent: AllowlistBrowserIntent, result: unknown) {
  const parsed = allowlistMutationResultSchema.safeParse(result);
  if (!parsed.success) return null;
  if (intent.type !== REAUTHENTICATION_OPERATION.updateAllowlistEntry) return parsed.data;
  const expectedVersion = intent.input.expectedVersion + (parsed.data.changed ? 1 : 0);
  return parsed.data.entryId !== intent.entryId || parsed.data.created || parsed.data.version !== expectedVersion ? null : parsed.data;
}

/** @param original - Read of the original operation that did not match it. @returns The copy that explains why it cannot be reconciled yet. */
export function readOriginalFailureMessage(original: AllowlistBrowserResult<unknown>): string {
  if (original.status !== "failed") return COPY.uncertain;
  return original.code === ADMISSION_ERROR_CODE.resourceUnavailable ? COPY.absent : original.message;
}

/** @param original - Read of the pending original. @returns Whether the server proved it was never registered, so the leader may discard it. */
export function isAbsentOriginal(original: AllowlistBrowserResult<unknown>): boolean {
  return original.status === "failed" && original.code === ADMISSION_ERROR_CODE.resourceUnavailable;
}

/**
 * The rules can change their contact type while still a draft; entries of the former type stay listed, but the writer rejects any change to them.
 * @param entry - Listed entry. @param contactType - Contact type of the current rules, or null without rules.
 * @returns Whether the entry belongs to a contact type the rules no longer use, so it cannot be edited.
 */
export function isOtherContactType(entry: Pick<AllowlistEntryResult, "contactType">, contactType: ReadyAllowlistState["contactType"]): boolean {
  return contactType !== null && entry.contactType !== contactType;
}

/** @param contactType - Policy contact type. @param proposal - Confirmed draft. @returns The original to dispatch, or null when the contact or name is invalid. */
export function buildAllowlistIntent(contactType: NonNullable<ReadyAllowlistState["contactType"]>, proposal: AllowlistDraft): AllowlistBrowserIntent | null {
  try {
    const displayName = normalizeAllowlistDisplayName(proposal.displayName), operationId = newAdmissionOperationId();
    if (proposal.entryId && proposal.expectedVersion) return { type: REAUTHENTICATION_OPERATION.updateAllowlistEntry, entryId: proposal.entryId, input: { operationId, confirmed: true, expectedVersion: proposal.expectedVersion, displayName, status: proposal.status } };
    const normalized = normalizeAdmissionContact({ type: contactType, value: proposal.identity, country: proposal.country || undefined });
    if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) return null;
    return { type: REAUTHENTICATION_OPERATION.createAllowlistEntry, input: { operationId, confirmed: true, contactType, identity: normalized.contact.value, ...(normalized.contact.type === "phone" ? { country: normalized.contact.country } : {}), displayName } };
  } catch { return null; }
}

/** Refs an action run owns while it is in flight. */
export type AllowlistRunRefs = {
  controllerRef: RefObject<AbortController | null>;
  busyRef: RefObject<boolean>;
  activeRef: RefObject<boolean>;
  generationRef: RefObject<number>;
  writeToastRef: RefObject<WriteToast | null>;
  currentPendingRef: RefObject<AllowlistBrowserIntent | null>;
};

/** One settled action run and the setters that report it. */
export type AllowlistSettledRun = { next: AbortController; scope: number; notice: WriteToast | null; fail: (message: string) => void; setErrorMessage: Dispatch<SetStateAction<string | null>>; setPhase: Dispatch<SetStateAction<AllowlistPhase>> };

/** @param refs - Workflow refs. @param settled - The run that ended. Reports a timeout, or returns to idle unless a lost viewer or an uncertain original must stay visible. */
function reportSettledAllowlistRun(refs: AllowlistRunRefs, settled: AllowlistSettledRun): void {
  const { next, fail, setErrorMessage, setPhase } = settled;
  if (next.signal.aborted && refs.currentPendingRef.current) { setErrorMessage(COPY.uncertain); setPhase(PHASE.uncertain); }
  else if (next.signal.aborted) { fail(BROWSER_REQUEST_TIMEOUT_MESSAGE); setPhase(PHASE.idle); }
  else setPhase((current) => current === PHASE.changedViewer || current === PHASE.uncertain ? current : PHASE.idle);
}

/** @param refs - Workflow refs. @param settled - The run that ended. Frees the workflow only when this run still owns it. */
export function settleAllowlistRun(refs: AllowlistRunRefs, settled: AllowlistSettledRun): void {
  if (refs.controllerRef.current === settled.next) {
    refs.controllerRef.current = null; refs.busyRef.current = false;
    if (refs.activeRef.current && refs.generationRef.current === settled.scope) reportSettledAllowlistRun(refs, settled);
  }
  if (refs.writeToastRef.current === settled.notice) refs.writeToastRef.current = null;
  settled.notice?.finish();
}

/** @param refs - Workflow refs. @param hydration - The scope's own hydration. Ends the scope: later replies are ignored and whichever action is running now is cancelled. */
export function closeAllowlistScope(refs: Pick<AllowlistRunRefs, "activeRef" | "generationRef" | "controllerRef">, hydration: AbortController): void {
  refs.activeRef.current = false; refs.generationRef.current += 1; hydration.abort(); refs.controllerRef.current?.abort();
}
