/** Pure decisions of the personal invitation management workflow, kept apart so each hook step stays readable. @module use-personal-invitation-management-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WriteToast } from "@/lib/toasts/write-toast";
import type { PersonalInvitationManagementIntent, PersonalInvitationManagementReference } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import { personalInvitationMutationResultSchema, personalInvitationMutationDenialSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-schemas";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY, PERSONAL_INVITATION_MANAGEMENT_PHASE as PHASE } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Visible management phase. */
export type PersonalInvitationManagementPhase = typeof PHASE[keyof typeof PHASE];

/** @param intent - Prepared explicit write. @returns The durable reference that lets another document recover it. */
export function referenceForManagementIntent(intent: PersonalInvitationManagementIntent): PersonalInvitationManagementReference {
  if (intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation) return { type: intent.type, operationId: intent.input.operationId, invitationId: null, expectedVersion: null };
  return { type: intent.type, operationId: intent.input.operationId, invitationId: intent.invitationId, expectedVersion: intent.input.expectedVersion };
}

/** @param reference - Original the outcome must belong to. @param result - Unvalidated terminal result. @returns The recorded denial, a matching completion, or null when the result cannot belong to that original. */
export function readManagementOutcome(reference: PersonalInvitationManagementReference, result: unknown) {
  const denial = personalInvitationMutationDenialSchema.safeParse(result), success = personalInvitationMutationResultSchema.safeParse(result);
  if (denial.success) return { kind: "denied", code: denial.data.code } as const;
  if (!success.success) return null;
  if (reference.invitationId === null) return { kind: "completed" } as const;
  const expectedVersion = (reference.expectedVersion ?? 0) + (success.data.changed ? 1 : 0);
  const matches = success.data.invitationId === reference.invitationId && !success.data.created && success.data.version === expectedVersion;
  return matches ? { kind: "completed" } as const : null;
}

/** Refs an action run owns while it is in flight. */
export type ManagementRunRefs = {
  controllerRef: RefObject<AbortController | null>;
  busyRef: RefObject<boolean>;
  mountedRef: RefObject<boolean>;
  generationRef: RefObject<number>;
  closedRef: RefObject<boolean>;
  pendingRef: RefObject<PersonalInvitationManagementReference | null>;
  writeToastRef: RefObject<WriteToast | null>;
};

/** @param pendingRef - Unresolved original, if any. @returns The failure copy of an interrupted action: uncertain while an original is pending. */
export function interruptedManagementMessage(pendingRef: RefObject<PersonalInvitationManagementReference | null>): string {
  return pendingRef.current ? COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable;
}

/** Where one run's retryable failures go. */
export type ManagementFailureTarget = { notice: WriteToast | null; reportReadFailure?: (message: string) => void; pendingRef: RefObject<PersonalInvitationManagementReference | null>; setErrorMessage: Dispatch<SetStateAction<string | null>> };

/** @param target - The run's toast, its read failure slot and the page alert. @returns A failure the leader can retry: the write's toast, or the page for a read or an unconfirmed original. */
export function createManagementFailure(target: ManagementFailureTarget): (message: string) => void {
  const { notice, reportReadFailure, pendingRef, setErrorMessage } = target;
  return (message) => {
    if (notice && !pendingRef.current) notice.announce({ kind: "error", message });
    else if (reportReadFailure && !pendingRef.current) reportReadFailure(message);
    else setErrorMessage(message);
  };
}

/** One settled action run. */
export type ManagementSettledRun = { next: AbortController; scope: number; notice: WriteToast | null; fail: (message: string) => void; setPhase: Dispatch<SetStateAction<PersonalInvitationManagementPhase>> };

/** @param refs - Workflow refs. @param settled - The run that ended. Frees the workflow only when this run still owns it and reports a timeout. */
export function settleManagementRun(refs: ManagementRunRefs, settled: ManagementSettledRun): void {
  const { next, scope, notice, fail, setPhase } = settled;
  if (refs.controllerRef.current === next) {
    refs.controllerRef.current = null; refs.busyRef.current = false;
    if (refs.mountedRef.current && refs.generationRef.current === scope && !refs.closedRef.current) {
      setPhase(refs.pendingRef.current ? PHASE.uncertain : PHASE.idle);
      if (next.signal.aborted) fail(interruptedManagementMessage(refs.pendingRef));
    }
  }
  if (refs.writeToastRef.current === notice) refs.writeToastRef.current = null;
  notice?.finish();
}

/** Refs that scope one mounted document. */
export type ManagementScopeRefs = Pick<ManagementRunRefs, "mountedRef" | "generationRef" | "controllerRef"> & { focusCheckRef: RefObject<AbortController | null> };

/** @param refs - Workflow scope refs. @param hydration - The scope's own hydration. Ends the scope: later replies are ignored and whichever action or focus check is running now is cancelled. */
export function closeManagementScope(refs: ManagementScopeRefs, hydration: AbortController): void {
  refs.mountedRef.current = false; refs.generationRef.current += 1; hydration.abort(); refs.controllerRef.current?.abort(); refs.focusCheckRef.current?.abort();
}
