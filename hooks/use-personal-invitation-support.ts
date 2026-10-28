/** Pure decisions of the personal invitation workflow, kept apart so each hook step stays readable. @module use-personal-invitation-support */
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { AdmissionBrowserSubmission } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { PersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";
import { PERSONAL_INVITATION_UI_PHASE, PERSONAL_INVITATION_UI_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/personal-invitation-overview";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/admission-public-contract";

/** Visible personal invitation phase. */
export type PersonalPhase = "idle" | "reading" | "submitting" | "changing_account" | "uncertain";
/** What a confirmed submission sends besides its own identity. */
export type PersonalSubmissionInput = Omit<AdmissionBrowserSubmission, "operationId" | "confirmed" | "invitationToken">;

/** @param snapshot - Current page state. @param digest - Route scope digest. @returns The viewer, tribe and scope a submission is stored under, or null while the invitation cannot be submitted. */
export function readSubmissionTarget(snapshot: PersonalInvitationPageState, digest: string | null) {
  if (snapshot.kind !== "ready" || !snapshot.viewerId || snapshot.preview.state !== PERSONAL_INVITATION_OVERVIEW_STATE.available || !digest) return null;
  const scope: Omit<PersonalInvitationSubmissionIntent, "operationId"> = { viewerId: snapshot.viewerId, slug: snapshot.preview.overview.tribe.slug, personalScope: digest };
  return { scope, overview: snapshot.preview.overview };
}
/** Overview of an invitation that can be submitted. */
export type SubmittableOverview = NonNullable<ReturnType<typeof readSubmissionTarget>>["overview"];

/** @param overview - Shown invitation. @param input - Requested submission. @returns Why the submission cannot be sent, or null when it can. */
export function readSubmissionBlock(overview: SubmittableOverview, input: PersonalSubmissionInput): string | null {
  if (overview.policy?.version !== input.expectedPolicyVersion || overview.state === ADMISSION_OVERVIEW_STATE.pending || overview.state === ADMISSION_OVERVIEW_STATE.alreadyMember) return ADMISSION_ERROR_MESSAGE.policy_conflict;
  if (overview.policy.requiresAdditionalVerification && !input.proofId) return PERSONAL_INVITATION_UI_COPY.verification;
  return null;
}

/** @param result - Failed or aborted read of the original. @returns Why it cannot be reconciled yet. */
export function readRecoveryFailureMessage(result: { status: "failed"; code: string } | { status: "aborted" }): string {
  return result.status === "failed" && result.code === ADMISSION_ERROR_CODE.resourceUnavailable ? PERSONAL_INVITATION_UI_COPY.absent : PERSONAL_INVITATION_UI_COPY.uncertain;
}

/** @param currentPhase - Phase when the request settles. @param runningPhase - Phase the request set. @param unresolved - Whether an original is still unresolved. @returns The phase after the request: uncertain or idle only if nothing replaced it meanwhile. */
function settledPhase(currentPhase: PersonalPhase, runningPhase: PersonalPhase, unresolved: boolean): PersonalPhase {
  if (currentPhase !== runningPhase) return currentPhase;
  return unresolved ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle;
}

/** Refs a request owns while it is in flight. */
export type PersonalRequestRefs = { controllerRef: RefObject<AbortController | null>; busyRef: RefObject<boolean>; activeRef: RefObject<boolean>; pendingRef: RefObject<PersonalInvitationSubmissionIntent | null> };

/** One settled explicit request. */
export type PersonalSettledRequest = { request: AbortController; runningPhase: PersonalPhase; abortedMessage: (unresolved: boolean) => string; setPhase: Dispatch<SetStateAction<PersonalPhase>>; setErrorMessage: Dispatch<SetStateAction<string | null>> };

/** @param refs - Workflow refs. @param settled - The request that ended. Frees the workflow only when this request still owns it and reports a timeout. */
export function settlePersonalRequest(refs: PersonalRequestRefs, settled: PersonalSettledRequest): void {
  if (refs.controllerRef.current !== settled.request) return;
  refs.controllerRef.current = null; refs.busyRef.current = false;
  if (!refs.activeRef.current) return;
  settled.setPhase((currentPhase) => settledPhase(currentPhase, settled.runningPhase, Boolean(refs.pendingRef.current)));
  if (settled.request.signal.aborted) settled.setErrorMessage(settled.abortedMessage(Boolean(refs.pendingRef.current)));
}

/** @param unresolved - Whether an original is still unresolved. @returns The failure copy of an interrupted observation. */
export function interruptedObservationMessage(unresolved: boolean): string {
  return unresolved ? PERSONAL_INVITATION_UI_COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable;
}

/** @param refs - Workflow refs. @param initialization - The mount's own initialization. @param setters - Phase and alert setters. Frees the workflow when initialization still owns it and reports its timeout. */
export function settlePersonalInitialization(refs: PersonalRequestRefs, initialization: AbortController, setters: Pick<PersonalSettledRequest, "setPhase" | "setErrorMessage">): void {
  if (refs.controllerRef.current !== initialization) return;
  refs.busyRef.current = false; refs.controllerRef.current = null;
  if (refs.activeRef.current && initialization.signal.aborted) { setters.setPhase(refs.pendingRef.current ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle); setters.setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); }
}

/** @param refs - Workflow refs. @param initialization - The mount's own initialization. Retires the mount and cancels whichever request is running now. */
export function retirePersonalInvitation(refs: Pick<PersonalRequestRefs, "activeRef" | "controllerRef" | "busyRef">, initialization: AbortController): void {
  refs.activeRef.current = false; initialization.abort(); refs.controllerRef.current?.abort(); refs.controllerRef.current = null; refs.busyRef.current = false;
}
