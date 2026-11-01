"use client";

/** Owns the single browser workflow, native viewer checks and durable local intent recovery. @module admission-container */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from "react";
import { Button, toast } from "@golfo/ui";
import { AdmissionRequestSteps } from "@/components/academy-admissions/admission-request-steps";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import { ADMISSION_REQUEST_FLOW_COPY, ADMISSION_REQUEST_FLOW_MODE, admissionRequestFlowSteps, type AdmissionRequestFlowStep } from "@/src/modules/academy-admissions/constants/admission-request-flow";
import { useAdmissionContactVerification, type AdmissionContactHookOptions } from "@/hooks/use-admission-contact-verification";
import { useAdmissionNotificationRefresh } from "@/hooks/use-admission-notification-refresh";
import { useAdmissionViewFeedback } from "@/hooks/use-admission-view-feedback";
import { useReplacedActionFocus } from "@/hooks/use-replaced-action-focus";
import { NOTIFICATION_REFRESH_OUTCOME } from "@/src/modules/notifications/constants/admission-notification-refresh";
import type { AdmissionNotificationRefreshOutcome } from "@/src/modules/notifications/application/results/notification-refresh-state";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import { ADMISSION_CONTACT_PHASE } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { AdmissionScreen } from "@/components/academy-admissions/admission-screen";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionOperationRecoveryDto } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import type { AdmissionAccountBrowserClient, AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { reloadCurrentPage, replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { getOwnAdmissionRequestMessage } from "@/src/modules/academy-admissions/application/results/admission-own-request-message";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { readAdmissionDraft, writeAdmissionDraft, newAdmissionOperationId, type AdmissionDraft, type AdmissionPendingIntent } from "@/lib/academy-admissions/admission-draft";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { resolveAccountChangeReturnPath } from "@/lib/academy-admissions/admission-account-change";
import { buildAccountChangeSignInUrl } from "@/lib/auth/sign-in-redirect";
import { ADMISSION_FEEDBACK_ORIGIN, ADMISSION_UI_COPY, ADMISSION_UI_PHASE, ADMISSION_UI_CLOCK_INTERVAL_MS, type AdmissionFeedbackOrigin } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_OUTCOME, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_OVERVIEW_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-overview";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { applicantRefusalMessage, isAdmissionStateChangedRefusal } from "@/src/modules/academy-admissions/application/results/admission-applicant-refusal";
import { ROUTES } from "@/src/constants/routes";
import { validateBrowserAdmissionWhatsappNumberDraft } from "@/src/modules/academy-admissions/infrastructure/browser/validate-admission-whatsapp-number-draft";
import { getAdmissionWhatsappNumberDraftMessage } from "@/src/modules/academy-admissions/application/results/admission-whatsapp-number-draft-message";
import { AdmissionWhatsappNumberForm } from "@/components/academy-admissions/admission-whatsapp-number-form";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";
import { ADMISSION_WHATSAPP_COPY, ADMISSION_WHATSAPP_INTENT_KIND, ADMISSION_WHATSAPP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

/** Submission refusals that the current overview may explain as needing another account. */
const ACCOUNT_CHANGE_SUBMISSION_CODES: ReadonlySet<string> = new Set([ADMISSION_ERROR_CODE.admissionIneligible, ADMISSION_ERROR_CODE.contactBindingConflict]);

type AdmissionUiPhase = typeof ADMISSION_UI_PHASE[keyof typeof ADMISSION_UI_PHASE];
type WhatsappConfirmationSnapshot = { requestId: string; version: number; required: boolean };
type AdmissionWriteResult = Awaited<ReturnType<AdmissionBrowserClient["submit"]>> | Awaited<ReturnType<AdmissionBrowserClient["cancel"]>> | Awaited<ReturnType<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>>;
type AdmissionContactState = ReturnType<typeof useAdmissionContactVerification>;
type ReadyAdmissionState = Extract<AdmissionPageState, { kind: "ready" }>;
type OwnAdmissionRequest = NonNullable<ReadyAdmissionState["request"]>;

type AdmissionContainerProps = { initialState: AdmissionPageState; requestPage?: boolean; client?: AdmissionBrowserClient; accountClient?: AdmissionAccountBrowserClient; whatsappClient?: Pick<AdmissionWhatsappNumberBrowserClient, "updateWhatsappNumber">; contactClient?: AdmissionContactBrowserClient; legacyInvitationToken?: string; arrivalScope?: string; arrivalReturnPath?: string };

/** @param intent - A write the applicant started. @returns The step or action whose error it is: the submission, the cancellation or the WhatsApp correction. */
function feedbackOriginOf(intent: AdmissionPendingIntent): AdmissionFeedbackOrigin {
  if (intent.kind === "submit") return ADMISSION_FEEDBACK_ORIGIN.submit;
  if (intent.kind === "cancel") return ADMISSION_FEEDBACK_ORIGIN.cancel;
  return ADMISSION_FEEDBACK_ORIGIN.whatsapp;
}

/** @param intent - Retained local intent. @returns The operation type its original server operation must have. */
function expectedOperationTypeOf(intent: AdmissionPendingIntent) {
  if (intent.kind === "submit") return ADMISSION_OPERATION_TYPE.submit;
  if (intent.kind === "cancel") return ADMISSION_OPERATION_TYPE.cancel;
  return ADMISSION_WHATSAPP_OPERATION;
}

/** @param intent - Write being sent. @returns The progress message of its toast. */
function writeProgressMessageOf(intent: AdmissionPendingIntent): string {
  if (intent.kind === "submit") return ADMISSION_UI_COPY.submitting;
  if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND) return ADMISSION_WHATSAPP_COPY.saving;
  return ADMISSION_UI_COPY.cancelling;
}

/** @param current - Current phase. @param hasPendingIntent - Whether an original intent is still unresolved. @returns The phase after a check ends: unresolved intents stay uncertain. */
function settleCheckingPhase(current: AdmissionUiPhase, hasPendingIntent: boolean): AdmissionUiPhase {
  if (current !== ADMISSION_UI_PHASE.checking) return current;
  return hasPendingIntent ? ADMISSION_UI_PHASE.uncertain : ADMISSION_UI_PHASE.idle;
}

/** Do not replace a confirmed newer resource snapshot with a historical operation result. */
function retainCurrentRequest(current: AdmissionRequestDto | null, incoming: AdmissionRequestDto | null): AdmissionRequestDto | null {
  return current && current.id === incoming?.id && current.version > incoming.version ? current : incoming;
}

/** @param active - Whether the container is mounted. @param signal - Operation cancellation. @returns Whether the operation may still publish results. */
function isLive(active: RefObject<boolean>, signal: AbortSignal): boolean {
  return active.current && !signal.aborted;
}

/** @param signal - Read cancellation. @returns The refresh outcome of a failed viewer check. */
function viewerCheckOutcome(signal: AbortSignal): AdmissionNotificationRefreshOutcome {
  return signal.aborted ? NOTIFICATION_REFRESH_OUTCOME.skipped : NOTIFICATION_REFRESH_OUTCOME.failed;
}

/** @param previous - Published snapshot. @param next - Incoming snapshot. @returns Whether the own request identity, version or WhatsApp rule changed. */
function hasRequestIdentityChanged(previous: AdmissionPageState, next: AdmissionPageState): boolean {
  if (previous.kind !== "ready" || next.kind !== "ready") return false;
  return previous.request?.id !== next.request?.id || previous.request?.version !== next.request?.version || previous.request?.requiresWhatsappNumber !== next.request?.requiresWhatsappNumber;
}

/** @param current - Published snapshot. @param snapshot - Snapshot a read started from. @returns Whether both belong to the same viewer and tribe. */
function isSameAdmissionScope(current: AdmissionPageState, snapshot: ReadyAdmissionState): current is ReadyAdmissionState {
  return current.kind === "ready" && current.viewerId === snapshot.viewerId && current.overview.tribe.slug === snapshot.overview.tribe.slug;
}

/** @param current - Published snapshot. @param overview - Fresh overview. @param own - Fresh own request. @returns The refreshed snapshot, or null when nothing observable changed. */
function buildRefreshedState(current: ReadyAdmissionState, overview: ReadyAdmissionState["overview"], own: AdmissionRequestDto | null): AdmissionPageState | null {
  const request = retainCurrentRequest(current.request, own);
  // Both projections are owned JSON contracts. Their dynamic rendering clock
  // is excluded so an equal read cannot replace form state or row identities.
  if (JSON.stringify(current.overview) === JSON.stringify(overview) && JSON.stringify(current.request) === JSON.stringify(request)) return null;
  return { ...current, overview, request, renderedAt: new Date().toISOString() };
}

/** @param snapshot - Published snapshot. @param result - Applied proof result. @returns The snapshot with the proof applied, or null when it does not advance the current request. */
function buildAppliedProofState(snapshot: AdmissionPageState, result: { requestId: string; requestVersion: number }): AdmissionPageState | null {
  if (snapshot.kind !== "ready" || snapshot.request?.id !== result.requestId || snapshot.request.version >= result.requestVersion) return null;
  const appliedRequest: AdmissionRequestDto = { ...snapshot.request, version: result.requestVersion, needsVerification: false,
    ...(snapshot.request.contact ? { contact: { ...snapshot.request.contact, evidenceKind: ADMISSION_EVIDENCE_KIND.local } } : {}),
    eligibilityReasons: snapshot.request.eligibilityReasons.filter((reason) => reason !== ADMISSION_DENIAL_REASON.proofRequired && reason !== ADMISSION_DENIAL_REASON.evidenceRevoked) };
  return { ...snapshot, request: appliedRequest, overview: { ...snapshot.overview, request: appliedRequest,
    safeMessage: getOwnAdmissionRequestMessage(appliedRequest) ?? ADMISSION_OVERVIEW_MESSAGE.pending } };
}

/** @param contact - Contact verification state. @returns Whether a contact operation is running or must be recovered first. */
function isContactBusy(contact: AdmissionContactState): boolean {
  return contact.phase !== ADMISSION_CONTACT_PHASE.idle && contact.phase !== ADMISSION_CONTACT_PHASE.uncertain || contact.recoveryRequired && !contact.ready;
}

/** @param input - Sent intent, transports and route facts. @returns The transport result of the original write. */
async function dispatchAdmissionWrite({ intent, slug, client, whatsappClient, legacyInvitationToken, signal }: { intent: AdmissionPendingIntent; slug: string; client: AdmissionBrowserClient; whatsappClient: Pick<AdmissionWhatsappNumberBrowserClient, "updateWhatsappNumber">; legacyInvitationToken?: string; signal: AbortSignal }): Promise<AdmissionWriteResult> {
  if (intent.kind === "submit") return client.submit(slug, { ...intent.input, ...(legacyInvitationToken ? { legacyInvitationToken } : {}) }, signal);
  if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND) return whatsappClient.updateWhatsappNumber(slug, intent.requestId, intent.input, signal);
  return client.cancel(slug, intent.requestId, intent.input, signal);
}

/** @param input - Arrival return path, request mode and published state. @returns The path sign-in returns to. */
function resolveReturnPath({ arrivalReturnPath, requestPage, state }: { arrivalReturnPath?: string; requestPage: boolean; state: AdmissionPageState }): string {
  if (arrivalReturnPath) return arrivalReturnPath;
  if (state.kind !== "ready") return state.returnPath ?? ROUTES.home;
  if (requestPage && state.request) return buildOwnAdmissionRequestRoute(state.overview.tribe.slug, state.request.id);
  return `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}`;
}

/** @param input - Verification availability, proof freshness and challenge. @returns The step a landed code write opens, if any. */
function resolveMilestone({ hasVerification, proofFresh, hasChallenge }: { hasVerification: boolean; proofFresh: boolean; hasChallenge: boolean }): AdmissionRequestFlowStep | null {
  if (!hasVerification) return null;
  if (proofFresh) return "finish";
  return hasChallenge ? "verify" : null;
}

/** @param input - Error origin and the places the page currently offers. @returns Whether the error can stay next to the step, action or field that produced it. */
function isErrorAnchored({ errorOrigin, offersSubmitStep, offersCancel, showsWhatsappEditor }: { errorOrigin: AdmissionFeedbackOrigin; offersSubmitStep: boolean; offersCancel: boolean; showsWhatsappEditor: boolean }): boolean {
  if (errorOrigin === ADMISSION_FEEDBACK_ORIGIN.submit) return offersSubmitStep;
  if (errorOrigin === ADMISSION_FEEDBACK_ORIGIN.cancel) return offersCancel;
  return errorOrigin === ADMISSION_FEEDBACK_ORIGIN.whatsapp && showsWhatsappEditor;
}

/** @param hasVerification - Whether the flow verifies a contact. @param proofFresh - Whether a fresh proof exists. @param flowMode - Submission or proof application. @returns Why the final step cannot run yet. */
function finalBlockedReasonOf(hasVerification: boolean, proofFresh: boolean, flowMode: string): string | undefined {
  if (!hasVerification || proofFresh) return undefined;
  return flowMode === ADMISSION_REQUEST_FLOW_MODE.apply ? ADMISSION_REQUEST_FLOW_COPY.applyProofRequired : ADMISSION_REQUEST_FLOW_COPY.proofRequired;
}

/** @param state - Published state. @param error - Last WhatsApp validation error. @returns The error while it still describes the current policy. */
function currentWhatsappValidationMessage(state: AdmissionPageState, error: { message: string; policyVersion: number } | null): string | null {
  return state.kind === "ready" && error !== null && error.policyVersion === state.overview.policy?.version ? error.message : null;
}

/** @param pendingRequest - Current pending request. @param error - Last WhatsApp correction error. @returns The error while it still describes that request version and rule. */
function currentWhatsappEditMessage(pendingRequest: OwnAdmissionRequest | null, error: { requestId: string; version: number; required: boolean; message: string } | null): string | null {
  return pendingRequest && error?.requestId === pendingRequest.id && error.version === pendingRequest.version && error.required === (pendingRequest.requiresWhatsappNumber ?? false) ? error.message : null;
}

/** Owns every state cell, ref and setter of the workflow; refs and setters are grouped in stable objects. */
function useAdmissionWorkflowState(initialState: AdmissionPageState) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<AdmissionDraft>({ phone: "", country: "", message: "" });
  const [confirmed, setConfirmed] = useState(false), [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [phase, setPhase] = useState<AdmissionUiPhase>(ADMISSION_UI_PHASE.idle);
  const viewFeedback = useAdmissionViewFeedback();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [whatsappValidationError, setWhatsappValidationError] = useState<{ message: string; policyVersion: number } | null>(null);
  const [whatsappConfirmed, setWhatsappConfirmed] = useState(false);
  const [writingWhatsapp, setWritingWhatsapp] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const [whatsappEditError, setWhatsappEditError] = useState<{ requestId: string; version: number; required: boolean; message: string } | null>(null);
  const whatsappConfirmation = useRef<WhatsappConfirmationSnapshot | null>(null);
  const [formReady, setFormReady] = useState(false), [accountChanged, setAccountChanged] = useState(false), [retryOriginal, setRetryOriginal] = useState(false);
  const [now, setNow] = useState(initialState.kind === "ready" ? initialState.renderedAt : "");
  const currentState = useRef(initialState), currentDraft = useRef(draft), pending = useRef<AdmissionPendingIntent | null>(null);
  const active = useRef(false), busy = useRef(false), canRetryOriginal = useRef(false), controller = useRef<AbortController | null>(null);
  const draftLoaded = useRef(false), writeToast = useRef<WriteToast | null>(null);
  const [step, setStep] = useState(0);
  const refs = useMemo(() => ({ activeRef: active, busyRef: busy, canRetryOriginalRef: canRetryOriginal, controllerRef: controller, currentDraftRef: currentDraft, currentStateRef: currentState, draftLoadedRef: draftLoaded, pendingRef: pending, whatsappConfirmationRef: whatsappConfirmation, writeToastRef: writeToast }), []);
  const setters = useMemo(() => ({ setAccountChanged, setCancelConfirmed, setChangingAccount, setConfirmed, setDraft, setFeedback, setFormReady, setNow, setPhase, setRetryOriginal, setState, setStep, setWhatsappConfirmed, setWhatsappEditError, setWhatsappValidationError, setWritingWhatsapp }), []);
  return { refs, setters, viewFeedback, values: { accountChanged, cancelConfirmed, changingAccount, confirmed, draft, feedback, formReady, now, phase, retryOriginal, state, step, whatsappConfirmed, whatsappEditError, whatsappValidationError, writingWhatsapp } };
}

type AdmissionWorkflow = ReturnType<typeof useAdmissionWorkflowState>;
type AdmissionRefs = AdmissionWorkflow["refs"];
type AdmissionSetters = AdmissionWorkflow["setters"];
type AdmissionViewFeedback = AdmissionWorkflow["viewFeedback"];

/** @param refs - Workflow refs. @param setters - Workflow setters. @returns A publisher of the current container's snapshot that forgets a stale WhatsApp confirmation. */
function useApplyAdmissionState(refs: AdmissionRefs, setters: AdmissionSetters) {
  return useCallback((next: AdmissionPageState) => { const { currentStateRef, whatsappConfirmationRef } = refs;
    if (hasRequestIdentityChanged(currentStateRef.current, next)) { whatsappConfirmationRef.current = null; setters.setWhatsappConfirmed(false); }
    currentStateRef.current = next; setters.setState(next);
  }, [refs, setters]);
}

/** A bfcache page must reload the original intent stored by a later document in this tab. */
function restoreAdmissionDraft({ refs, setters, arrivalScope, legacyInvitationToken }: { refs: AdmissionRefs; setters: AdmissionSetters; arrivalScope?: string; legacyInvitationToken?: string }) {
  const snapshot = refs.currentStateRef.current;
  if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
  if (legacyInvitationToken && !arrivalScope) { setters.setFormReady(false); return; }
  const record = readAdmissionDraft(snapshot.viewerId, snapshot.overview.tribe.slug, arrivalScope);
  if (record) { refs.currentDraftRef.current = record.draft; setters.setDraft(record.draft); refs.pendingRef.current = record.pending; }
  refs.draftLoadedRef.current = true; setters.setFormReady(true);
  setters.setConfirmed(false); setters.setCancelConfirmed(false); setters.setWhatsappConfirmed(false); refs.whatsappConfirmationRef.current = null; refs.canRetryOriginalRef.current = false; setters.setRetryOriginal(false);
}

/** Saves, clears and restores the local draft and the exact original intent. */
function useAdmissionDraftStorage({ refs, setters, arrivalScope, legacyInvitationToken, setErrorMessage }: { refs: AdmissionRefs; setters: AdmissionSetters; arrivalScope?: string; legacyInvitationToken?: string; setErrorMessage: AdmissionViewFeedback["setErrorMessage"] }) {
  /** Saves the original body before dispatch; unavailable storage blocks a new write. */
  const persist = useCallback((intent: AdmissionPendingIntent | null) => { const { currentDraftRef, currentStateRef } = refs;
    const snapshot = currentStateRef.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return false;
    if (legacyInvitationToken && !arrivalScope) return false;
    try { writeAdmissionDraft({ viewerId: snapshot.viewerId, slug: snapshot.overview.tribe.slug, draft: currentDraftRef.current, pending: intent, ...(arrivalScope ? { arrivalScope } : {}) }); return true; }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, intent ? feedbackOriginOf(intent) : ADMISSION_FEEDBACK_ORIGIN.page); return false; }
  }, [arrivalScope, legacyInvitationToken, setErrorMessage, refs]);

  /** Clears only a known final local intent; storage failures never turn that result into a new write. */
  const clearIntent = useCallback(() => { const { canRetryOriginalRef, pendingRef } = refs; pendingRef.current = null; canRetryOriginalRef.current = false; setters.setRetryOriginal(false); persist(null); }, [persist, refs, setters]);

  /** A bfcache page must reload the original intent stored by a later document in this tab. */
  const restoreDraft = useCallback(() => { restoreAdmissionDraft({ refs, setters, arrivalScope, legacyInvitationToken }); }, [arrivalScope, legacyInvitationToken, refs, setters]);

  return { clearIntent, persist, restoreDraft };
}

/** @returns A native viewer check: whether the current viewer may retain this account's draft and actions. */
function useAdmissionViewerCheck({ refs, setters, client, viewFeedback }: { refs: AdmissionRefs; setters: AdmissionSetters; client: AdmissionBrowserClient; viewFeedback: AdmissionViewFeedback }) {
  const { setErrorMessage, setReadErrorMessage } = viewFeedback;
  /** @param signal - Original operation cancellation. @param quiet - Leaves background transport feedback with its refresh owner. @returns Whether the current native viewer may retain this account's draft and actions. */
  return useCallback(async (signal: AbortSignal, quiet = false): Promise<boolean> => { const { activeRef, currentStateRef, draftLoadedRef } = refs;
    const snapshot = currentStateRef.current;
    if (snapshot.kind !== "ready") return false;
    const result = await client.viewer(signal);
    if (!activeRef.current || signal.aborted) return false;
    if (result.status !== "ready") { if (result.status === "failed" && !quiet) setReadErrorMessage(ADMISSION_UI_COPY.readFailed); return false; }
    if ((result.value?.id ?? null) !== snapshot.viewerId) { setters.setAccountChanged(true); setters.setFormReady(false); setErrorMessage(ADMISSION_UI_COPY.accountChanged); return false; }
    setters.setFormReady(draftLoadedRef.current || snapshot.viewerId === null);
    return true;
  }, [client, setErrorMessage, setReadErrorMessage, refs, setters]);
}

/** @param refs - Workflow refs. @param quiet - Whether the read runs in the background. @returns Whether a background read must yield to a write in flight. */
function isQuietRefreshBlocked(refs: AdmissionRefs, quiet: boolean): boolean {
  return quiet && Boolean(refs.busyRef.current || refs.pendingRef.current);
}

/** @returns A current own read that never substitutes it into the original ledger response. */
function useAdmissionRefresh({ refs, setters, client, checkViewer, applyState, targetRequestId, viewFeedback }: { refs: AdmissionRefs; setters: AdmissionSetters; client: AdmissionBrowserClient; checkViewer: (signal: AbortSignal, quiet?: boolean) => Promise<boolean>; applyState: (next: AdmissionPageState) => void; targetRequestId: string | undefined; viewFeedback: AdmissionViewFeedback }) {
  const { setReadErrorMessage, clearReadError } = viewFeedback;
  /** @param signal - Original current own read. @param quiet - Preserves form state and uses the scheduler's failure feedback. @returns Current own freshness without substituting it into the original ledger response. */
  return useCallback(async (signal: AbortSignal, quiet = false): Promise<AdmissionNotificationRefreshOutcome> => { const { activeRef, currentStateRef } = refs;
    const snapshot = currentStateRef.current;
    if (snapshot.kind !== "ready" || isQuietRefreshBlocked(refs, quiet)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    if (!await checkViewer(signal, quiet)) return viewerCheckOutcome(signal);
    const [overview, own] = await Promise.all([
      client.overview(snapshot.overview.tribe.slug, signal),
      snapshot.viewerId ? client.own(snapshot.overview.tribe.slug, targetRequestId, signal) : Promise.resolve({ status: "ready" as const, value: null }),
    ]);
    if (!isLive(activeRef, signal) || isQuietRefreshBlocked(refs, quiet)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    if (!await checkViewer(signal, quiet)) return viewerCheckOutcome(signal);
    if (overview.status !== "ready" || own.status !== "ready" || overview.value.tribe.slug !== snapshot.overview.tribe.slug || targetRequestId && own.value?.id !== targetRequestId) { if (!quiet) setReadErrorMessage(ADMISSION_UI_COPY.readFailed); return NOTIFICATION_REFRESH_OUTCOME.failed; }
    if (isQuietRefreshBlocked(refs, quiet)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    const current = currentStateRef.current;
    if (!isSameAdmissionScope(current, snapshot)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    const next = buildRefreshedState(current, overview.value, own.value);
    if (next) applyState(next);
    if (!quiet) setters.setNow(new Date().toISOString());
    clearReadError();
    return NOTIFICATION_REFRESH_OUTCOME.refreshed;
  }, [client, checkViewer, applyState, targetRequestId, setReadErrorMessage, clearReadError, refs, setters]);
}

type CheckViewer = (signal: AbortSignal, quiet?: boolean) => Promise<boolean>;
type RefreshAdmission = (signal: AbortSignal, quiet?: boolean) => Promise<AdmissionNotificationRefreshOutcome>;
type FailedWriteResult = Extract<AdmissionWriteResult, { status: "failed" }>;
type ConfirmedWriteValue = Exclude<Extract<AdmissionWriteResult, { status: "ready" }>["value"], { state: "started" }>;
type RecoveredResultShape = { type: string; result: { admissionRequestId?: string | null; status?: string; version?: number; changed?: boolean; outcome?: string } };

/** @param intent - Retained local intent. @returns The request id a refusal of its original operation must name. */
function expectedRequestIdOf(intent: AdmissionPendingIntent): string | null {
  return intent.kind === "submit" ? null : intent.requestId.toLowerCase();
}

/** @param intent - Retained local intent. @param operation - Completed original operation. @returns Whether a transition or correction result describes another request or version. */
function isRecoveredResultForeign(intent: AdmissionPendingIntent, operation: RecoveredResultShape): boolean {
  if (operation.type === ADMISSION_OPERATION_TYPE.cancel && intent.kind === "cancel") return operation.result.admissionRequestId !== intent.requestId || operation.result.status !== "cancelled";
  if (operation.type !== ADMISSION_WHATSAPP_OPERATION) return false;
  return intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND || operation.result.admissionRequestId !== intent.requestId.toLowerCase() || operation.result.version !== intent.input.expectedVersion + (operation.result.changed ? 1 : 0);
}

/** @param operation - Completed original operation. @returns The success message of its recovered result. */
function recoveredOperationMessage(operation: RecoveredResultShape): string {
  if (operation.type === ADMISSION_OPERATION_TYPE.submit) return operation.result.outcome === ADMISSION_OUTCOME.pending ? ADMISSION_UI_COPY.outcomePending : ADMISSION_UI_COPY.outcomeMember;
  if (operation.type === ADMISSION_WHATSAPP_OPERATION) return operation.result.changed ? ADMISSION_WHATSAPP_COPY.saved : ADMISSION_WHATSAPP_COPY.unchanged;
  return ADMISSION_UI_COPY.cancelled;
}

/** @param intent - Sent correction. @param value - Confirmed correction result. @returns Whether the result describes another request or version. */
function isWhatsappWriteForeign(intent: AdmissionPendingIntent, value: { admissionRequestId: string; version: number; changed: boolean }): boolean {
  return intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND || value.admissionRequestId !== intent.requestId.toLowerCase() || value.version !== intent.input.expectedVersion + (value.changed ? 1 : 0);
}

/** Releases a finished write: its toast closes and, when it still owns the controller, the workflow unlocks. */
function releaseWrite(refs: AdmissionRefs, { notice, request, onActiveRelease }: { notice: WriteToast; request: AbortController; onActiveRelease: () => void }) {
  if (refs.writeToastRef.current === notice) refs.writeToastRef.current = null;
  notice.finish();
  if (refs.controllerRef.current !== request) return;
  refs.busyRef.current = false;
  if (refs.activeRef.current) onActiveRelease();
}

/** Reads the current projection, then marks the workflow idle while it is still live. */
function useRefreshAndIdle({ refs, setters, refresh, clearRefreshFailure }: { refs: AdmissionRefs; setters: AdmissionSetters; refresh: RefreshAdmission; clearRefreshFailure: () => void }) {
  return useCallback(async (signal: AbortSignal) => { const { activeRef } = refs;
    if (await refresh(signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed) clearRefreshFailure();
    if (isLive(activeRef, signal)) setters.setPhase(ADMISSION_UI_PHASE.idle);
  }, [refresh, clearRefreshFailure, refs, setters]);
}

/**
 * Offers resending the retained original with its exact operation id and body: the ledger inserts, reclaims or replays it idempotently,
 * so an absent original is registered once and a started one whose effect stopped is resumed instead of staying in progress forever.
 * @param refs - Workflow refs. @param setters - Workflow setters. @param feedback - Why the original is not confirmed yet.
 */
function offerOriginalRetry(refs: AdmissionRefs, setters: AdmissionSetters, feedback: string): void {
  refs.canRetryOriginalRef.current = true; setters.setRetryOriginal(true); setters.setFeedback(feedback); setters.setPhase(ADMISSION_UI_PHASE.uncertain);
}

type RecoveryOptions = { refs: AdmissionRefs; setters: AdmissionSetters; client: AdmissionBrowserClient; checkViewer: CheckViewer; clearIntent: () => void; refresh: RefreshAdmission; refreshAndIdle: (signal: AbortSignal) => Promise<void>; confirmOwnAction: () => void; setErrorMessage: AdmissionViewFeedback["setErrorMessage"] };

/** @returns A recovery that retrieves original registered state without issuing a POST or fabricating acceptance. */
function useAdmissionRecovery({ refs, setters, client, checkViewer, clearIntent, refresh, refreshAndIdle, confirmOwnAction, setErrorMessage }: RecoveryOptions) {
  const failRecovery = useCallback(() => { setErrorMessage(ADMISSION_UI_COPY.readFailed); setters.setPhase(ADMISSION_UI_PHASE.uncertain); }, [setErrorMessage, setters]);
  const settleRefusal = useCallback(async (message: string, signal: AbortSignal) => { const { activeRef } = refs;
    clearIntent(); setters.setFeedback(""); setErrorMessage(message);
    await refresh(signal); if (isLive(activeRef, signal)) setters.setPhase(ADMISSION_UI_PHASE.idle);
  }, [clearIntent, refresh, setErrorMessage, refs, setters]);
  const settleSuccess = useCallback(async (message: string, signal: AbortSignal) => { const { whatsappConfirmationRef } = refs;
    clearIntent(); setters.setWhatsappConfirmed(false); whatsappConfirmationRef.current = null;
    toast.success(message);
    confirmOwnAction();
    await refreshAndIdle(signal);
  }, [clearIntent, confirmOwnAction, refreshAndIdle, refs, setters]);
  const settleOperation = useCallback(async (intent: AdmissionPendingIntent, operation: AdmissionOperationRecoveryDto, signal: AbortSignal) => {
    if (operation.operationId !== intent.input.operationId.toLowerCase() || operation.type !== expectedOperationTypeOf(intent)) { failRecovery(); return; }
    if (operation.state !== "completed") { offerOriginalRetry(refs, setters, ADMISSION_UI_COPY.started); return; }
    if ("code" in operation.result) {
      if (operation.result.admissionRequestId !== expectedRequestIdOf(intent)) { failRecovery(); return; }
      await settleRefusal(ADMISSION_ERROR_MESSAGE[operation.result.code], signal);
      return;
    }
    if (isRecoveredResultForeign(intent, operation)) { failRecovery(); return; }
    await settleSuccess(recoveredOperationMessage(operation), signal);
  }, [failRecovery, settleRefusal, settleSuccess, refs, setters]);

  return useCallback(async (signal: AbortSignal) => { const { activeRef, canRetryOriginalRef, currentStateRef, pendingRef } = refs;
    const snapshot = currentStateRef.current, intent = pendingRef.current;
    if (snapshot.kind !== "ready" || !intent || !await checkViewer(signal)) return;
    canRetryOriginalRef.current = false; setters.setRetryOriginal(false);
    const result = await client.operation(snapshot.overview.tribe.slug, intent.input.operationId, signal);
    if (!isLive(activeRef, signal) || !await checkViewer(signal)) return;
    if (result.status === "ready") { await settleOperation(intent, result.value, signal); return; }
    if (result.status === "failed" && result.code === ADMISSION_ERROR_CODE.resourceUnavailable) { offerOriginalRetry(refs, setters, ADMISSION_UI_COPY.absent); return; }
    if (result.status === "failed") setErrorMessage(result.message);
    setters.setPhase(ADMISSION_UI_PHASE.uncertain);
  }, [client, checkViewer, settleOperation, setErrorMessage, refs, setters]);
}

/** @param intent - Refused write. @param code - Its definitive code. @returns Whether the refusal means the state behind the page changed (a WhatsApp correction reads it again on its own). */
function readsStateAgainAfter(intent: AdmissionPendingIntent, code: FailedWriteResult["code"]): boolean {
  if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND) return false;
  return isAdmissionStateChangedRefusal(code) || intent.kind === "submit" && ACCOUNT_CHANGE_SUBMISSION_CODES.has(code);
}

type WriteCompletionOptions = { refs: AdmissionRefs; setters: AdmissionSetters; applyState: (next: AdmissionPageState) => void; clearIntent: () => void; refresh: RefreshAdmission; refreshAndIdle: (signal: AbortSignal) => Promise<void>; confirmOwnAction: () => void; setErrorMessage: AdmissionViewFeedback["setErrorMessage"] };

/** @returns Handlers that apply a failed or confirmed write result. */
function useAdmissionWriteResults({ refs, setters, applyState, clearIntent, refresh, setErrorMessage }: WriteCompletionOptions) {
  /**
   * The rules, the request or the account binding changed after this page loaded: the page reads the current state and asks for a new
   * confirmation, so another try never resends the version the server refused. A list or binding refusal may then offer another account.
   */
  const rereadChangedState = useCallback(async (intent: AdmissionPendingIntent, result: FailedWriteResult, signal: AbortSignal) => { const { activeRef, currentStateRef } = refs;
    setters.setConfirmed(false); setters.setCancelConfirmed(false);
    const refreshed = await refresh(signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed, current = currentStateRef.current;
    if (!isLive(activeRef, signal)) return;
    const offersAccountChange = intent.kind === "submit" && ACCOUNT_CHANGE_SUBMISSION_CODES.has(result.code) && refreshed && current.kind === "ready" && current.overview.nextAction === ADMISSION_NEXT_ACTION.changeAccount;
    setErrorMessage(offersAccountChange ? null : applicantRefusalMessage(result.code, result.message), feedbackOriginOf(intent));
  }, [refresh, refs, setErrorMessage, setters]);
  /** A failed request, cancellation or correction stays next to the step or action that sent it; the toast only closes. An uncertain one belongs to the page. */
  const handleFailedWrite = useCallback(async (intent: AdmissionPendingIntent, result: FailedWriteResult, signal: AbortSignal) => { const { activeRef, whatsappConfirmationRef } = refs;
    if (result.uncertain) { setErrorMessage(result.message); setters.setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    setErrorMessage(result.message, feedbackOriginOf(intent));
    // A definitive refusal registered nothing: its local intent is released, never kept to be recovered or resent.
    clearIntent(); if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND) { setters.setWhatsappConfirmed(false); whatsappConfirmationRef.current = null; await refresh(signal); }
    // Only the TuTribu team can lift a platform refusal: the current projection is read again so a page the platform closed stops offering the form, and the refusal stays visible.
    if (result.code === ADMISSION_ERROR_CODE.platformSecurityUnavailable) {
      if (intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND) await refresh(signal);
      if (isLive(activeRef, signal)) setErrorMessage(result.message, feedbackOriginOf(intent));
    }
    if (readsStateAgainAfter(intent, result.code)) await rereadChangedState(intent, result, signal);
    if (isLive(activeRef, signal)) setters.setPhase(ADMISSION_UI_PHASE.idle);
  }, [clearIntent, refresh, rereadChangedState, setErrorMessage, refs, setters]);

  /** @returns Whether the confirmed correction belongs to the sent intent; otherwise the page waits for recovery. */
  const applyConfirmedWhatsapp = useCallback((intent: AdmissionPendingIntent, value: Extract<ConfirmedWriteValue, { changed: boolean }>, snapshot: ReadyAdmissionState): boolean => { const { writeToastRef } = refs;
    if (intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND || isWhatsappWriteForeign(intent, value)) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setters.setPhase(ADMISSION_UI_PHASE.uncertain); return false; }
    if (snapshot.request?.id === value.admissionRequestId && value.version >= snapshot.request.version) applyState({ ...snapshot, request: { ...snapshot.request, whatsappNumber: intent.input.whatsappNumber, version: value.version } });
    writeToastRef.current?.announce({ kind: "success", message: value.changed ? ADMISSION_WHATSAPP_COPY.saved : ADMISSION_WHATSAPP_COPY.unchanged });
    return true;
  }, [applyState, setErrorMessage, refs, setters]);

  /** Applies minimal confirmed mutation data while the current projection is reconciled. @returns Whether the result was accepted. */
  const applyConfirmedWrite = useCallback((intent: AdmissionPendingIntent, value: ConfirmedWriteValue, snapshot: ReadyAdmissionState): boolean => { const { writeToastRef } = refs;
    if ("outcome" in value) {
      const request = value.outcome === ADMISSION_OUTCOME.pending ? retainCurrentRequest(snapshot.request, value.request) : snapshot.request;
      applyState({ ...snapshot, request });
      writeToastRef.current?.announce({ kind: "success", message: value.safeMessage });
      return true;
    }
    if ("changed" in value) return applyConfirmedWhatsapp(intent, value, snapshot);
    if (snapshot.request?.id === value.admissionRequestId && value.version >= snapshot.request.version) {
      applyState({ ...snapshot, request: { ...snapshot.request, status: value.status, version: Math.max(snapshot.request.version, value.version) } });
      writeToastRef.current?.announce({ kind: "success", message: ADMISSION_UI_COPY.cancelled });
    }
    return true;
  }, [applyState, applyConfirmedWhatsapp, refs]);

  return { applyConfirmedWrite, handleFailedWrite };
}

/** @returns A completion that applies a write result and reconciles the current projection. */
function useAdmissionWriteCompletion(options: WriteCompletionOptions) {
  const { refs, setters, clearIntent, refreshAndIdle, confirmOwnAction } = options;
  const { applyConfirmedWrite, handleFailedWrite } = useAdmissionWriteResults(options);
  return useCallback(async (intent: AdmissionPendingIntent, result: AdmissionWriteResult, signal: AbortSignal) => { const { activeRef, currentStateRef, whatsappConfirmationRef } = refs;
    if (!isLive(activeRef, signal)) return;
    if (result.status === "aborted") { setters.setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (result.status === "failed") { await handleFailedWrite(intent, result, signal); return; }
    // The same original is still registered as started: it may be resent as is, which resumes it once its effect stopped.
    if ("state" in result.value) { offerOriginalRetry(refs, setters, ADMISSION_UI_COPY.started); return; }
    const snapshot = currentStateRef.current;
    if (snapshot.kind !== "ready") return;
    if (!applyConfirmedWrite(intent, result.value, snapshot)) return;
    clearIntent(); setters.setConfirmed(false); setters.setCancelConfirmed(false); setters.setWhatsappConfirmed(false); whatsappConfirmationRef.current = null;
    confirmOwnAction();
    await refreshAndIdle(signal);
  }, [applyConfirmedWrite, handleFailedWrite, clearIntent, refreshAndIdle, confirmOwnAction, refs, setters]);
}

type AdmissionWriteOptions = { refs: AdmissionRefs; setters: AdmissionSetters; accountChanged: boolean; checkViewer: CheckViewer; client: AdmissionBrowserClient; whatsappClient: Pick<AdmissionWhatsappNumberBrowserClient, "updateWhatsappNumber">; completeWrite: (intent: AdmissionPendingIntent, result: AdmissionWriteResult, signal: AbortSignal) => Promise<void>; persist: (intent: AdmissionPendingIntent | null) => boolean; legacyInvitationToken?: string; setErrorMessage: AdmissionViewFeedback["setErrorMessage"]; captureActionFocus: () => void; finishActionFocus: () => void };

/** @returns A write that reuses exactly the retained original body; changes to a draft cannot rewrite an ambiguous intent. */
function useAdmissionWrite({ refs, setters, accountChanged, checkViewer, client, whatsappClient, completeWrite, persist, legacyInvitationToken, setErrorMessage, captureActionFocus, finishActionFocus }: AdmissionWriteOptions) {
  return useCallback(async (intent: AdmissionPendingIntent) => { const { activeRef, busyRef, canRetryOriginalRef, controllerRef, currentStateRef, pendingRef, writeToastRef } = refs;
    if (busyRef.current || accountChanged) return;
    const snapshot = currentStateRef.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    captureActionFocus();
    busyRef.current = true; controllerRef.current?.abort(); const request = new AbortController(); controllerRef.current = request;
    setErrorMessage(null); setters.setFeedback(null); canRetryOriginalRef.current = false; setters.setRetryOriginal(false);
    const notice = startWriteToast(writeProgressMessageOf(intent)); writeToastRef.current = notice;
    try {
      if (!await checkViewer(request.signal)) return;
      if (!persist(intent)) return;
      pendingRef.current = intent; setters.setWritingWhatsapp(intent.kind === ADMISSION_WHATSAPP_INTENT_KIND); setters.setPhase(ADMISSION_UI_PHASE.writing);
      const result = await dispatchAdmissionWrite({ intent, slug: snapshot.overview.tribe.slug, client, whatsappClient, legacyInvitationToken, signal: request.signal });
      if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND && !await checkViewer(request.signal)) { if (isLive(activeRef, request.signal)) setters.setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      await completeWrite(intent, result, request.signal);
    } catch { if (isLive(activeRef, request.signal)) { setErrorMessage(ADMISSION_UI_COPY.uncertain); setters.setPhase(ADMISSION_UI_PHASE.uncertain); } }
    finally { releaseWrite(refs, { notice, request, onActiveRelease: () => { setters.setWritingWhatsapp(false); finishActionFocus(); } }); }
  }, [accountChanged, checkViewer, client, whatsappClient, completeWrite, persist, legacyInvitationToken, setErrorMessage, captureActionFocus, finishActionFocus, refs, setters]);
}

type AdmissionReadOptions = { refs: AdmissionRefs; setters: AdmissionSetters; recover: (signal: AbortSignal) => Promise<void>; refreshAndIdle: (signal: AbortSignal) => Promise<void>; checkViewer: CheckViewer; restoreDraft: () => void; setErrorMessage: AdmissionViewFeedback["setErrorMessage"] };

/** Recovers a retained intent or refreshes the current projection; `restored` re-checks a bfcache page first. */
async function readAdmission({ refs, setters, recover, refreshAndIdle, checkViewer, restoreDraft, setErrorMessage, failRead, settleRead }: AdmissionReadOptions & { failRead: (signal: AbortSignal) => void; settleRead: (request: AbortController) => void }, restored: boolean) {
  if (refs.busyRef.current && !restored) return;
  refs.controllerRef.current?.abort(); const request = new AbortController(); refs.controllerRef.current = request; refs.busyRef.current = true;
  if (restored) { refs.draftLoadedRef.current = false; setters.setFormReady(false); }
  setErrorMessage(null); setters.setFeedback(null); setters.setPhase(ADMISSION_UI_PHASE.checking);
  try {
    if (restored || !refs.draftLoadedRef.current) { if (!await checkViewer(request.signal)) return; restoreDraft(); }
    if (refs.pendingRef.current) await recover(request.signal); else await refreshAndIdle(request.signal);
  }
  catch { failRead(request.signal); }
  finally { settleRead(request); }
}

/** @returns A read that recovers a retained intent or refreshes the current projection; `restored` re-checks a bfcache page first. */
function useAdmissionRead({ refs, setters, recover, refreshAndIdle, checkViewer, restoreDraft, setErrorMessage }: AdmissionReadOptions) {
  const failRead = useCallback((signal: AbortSignal) => { const { activeRef, draftLoadedRef } = refs;
    if (!isLive(activeRef, signal)) return;
    setErrorMessage(ADMISSION_UI_COPY.readFailed);
    if (!draftLoadedRef.current) setters.setFormReady(false);
  }, [setErrorMessage, refs, setters]);
  const settleRead = useCallback((request: AbortController) => { const { activeRef, busyRef, controllerRef, pendingRef } = refs;
    if (controllerRef.current !== request) return;
    busyRef.current = false;
    if (isLive(activeRef, request.signal)) setters.setPhase((current) => settleCheckingPhase(current, Boolean(pendingRef.current)));
  }, [refs, setters]);
  return useCallback((restored = false) => readAdmission({ refs, setters, recover, refreshAndIdle, checkViewer, restoreDraft, setErrorMessage, failRead, settleRead }, restored), [recover, refreshAndIdle, checkViewer, restoreDraft, setErrorMessage, failRead, settleRead, refs, setters]);
}

type AdmissionInitializationContext = { refs: AdmissionRefs; setters: AdmissionSetters; initialization: AbortController; checkViewer: CheckViewer; recover: (signal: AbortSignal) => Promise<void>; restoreDraft: () => void; setErrorMessage: AdmissionViewFeedback["setErrorMessage"] };

/** Checks the native viewer, restores the draft and recovers a retained intent once the container mounts. */
async function initializeAdmission({ refs, setters, initialization, checkViewer, recover, restoreDraft, setErrorMessage }: AdmissionInitializationContext) {
  await Promise.resolve();
  if (!isLive(refs.activeRef, initialization.signal)) return;
  setters.setFormReady(false); setters.setPhase(ADMISSION_UI_PHASE.checking);
  try {
    if (!await checkViewer(initialization.signal)) return;
    const snapshot = refs.currentStateRef.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    restoreDraft();
    if (refs.pendingRef.current) { setters.setPhase(ADMISSION_UI_PHASE.checking); await recover(initialization.signal); }
  } catch { if (isLive(refs.activeRef, initialization.signal)) { setErrorMessage(ADMISSION_UI_COPY.storageFailed); setters.setFormReady(false); } }
  finally { if (refs.controllerRef.current === initialization && !initialization.signal.aborted) { refs.busyRef.current = false; setters.setPhase((current) => settleCheckingPhase(current, Boolean(refs.pendingRef.current))); } }
}

/** Initializes the workflow, re-reads bfcache restores and keeps the expiry clock current while mounted. */
function useAdmissionLifecycle({ refs, setters, checkViewer, recover, read, restoreDraft, setErrorMessage }: Omit<AdmissionInitializationContext, "initialization"> & { read: (restored?: boolean) => Promise<void> }) {
  useEffect(() => { const { activeRef, busyRef, controllerRef, draftLoadedRef, whatsappConfirmationRef } = refs;
    activeRef.current = true; const lifecycle = new AbortController(), initialization = new AbortController(); controllerRef.current = initialization; busyRef.current = true;
    draftLoadedRef.current = false;
    void initializeAdmission({ refs, setters, initialization, checkViewer, recover, restoreDraft, setErrorMessage });
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void read(true); };
    window.addEventListener("pageshow", onPageShow);
    const timer = setInterval(() => { if (!lifecycle.signal.aborted) setters.setNow(new Date().toISOString()); }, ADMISSION_UI_CLOCK_INTERVAL_MS);
    // Activity preserves the draft, but native-viewer freshness must not survive its hidden interval.
    return () => { lifecycle.abort(); initialization.abort(); controllerRef.current?.abort(); activeRef.current = false; setters.setFormReady(false); setters.setWhatsappConfirmed(false); whatsappConfirmationRef.current = null; window.removeEventListener("pageshow", onPageShow); clearInterval(timer); };
  }, [checkViewer, recover, read, restoreDraft, setErrorMessage, refs, setters]);
}

type AdmissionEngineOptions = { workflow: AdmissionWorkflow; client: AdmissionBrowserClient; whatsappClient: Pick<AdmissionWhatsappNumberBrowserClient, "updateWhatsappNumber">; legacyInvitationToken?: string; arrivalScope?: string; targetRequestId: string | undefined; captureActionFocus: () => void; finishActionFocus: () => void };

/** Wires the viewer checks, reads, recovery and writes of the workflow. */
function useAdmissionEngine({ workflow, client, whatsappClient, legacyInvitationToken, arrivalScope, targetRequestId, captureActionFocus, finishActionFocus }: AdmissionEngineOptions) {
  const { refs, setters, values, viewFeedback } = workflow;
  const { setErrorMessage } = viewFeedback;
  const applyState = useApplyAdmissionState(refs, setters);
  const { clearIntent, persist, restoreDraft } = useAdmissionDraftStorage({ refs, setters, arrivalScope, legacyInvitationToken, setErrorMessage });
  const checkViewer = useAdmissionViewerCheck({ refs, setters, client, viewFeedback });
  const refresh = useAdmissionRefresh({ refs, setters, client, checkViewer, applyState, targetRequestId, viewFeedback });
  const refreshVisibleRequest = useCallback((signal: AbortSignal) => refresh(signal, true), [refresh]);
  const { state, phase, accountChanged } = values;
  const notificationRefresh = useAdmissionNotificationRefresh({
    enabled: state.kind === "ready" && Boolean(state.viewerId) && !accountChanged,
    paused: state.kind !== "ready" || state.request?.status !== ADMISSION_REQUEST_STATUS.pending || phase !== ADMISSION_UI_PHASE.idle,
    scopeKey: state.kind === "ready" ? `${state.viewerId ?? ""}:${state.overview.tribe.slug}:${state.request?.id ?? ""}` : "",
    refresh: refreshVisibleRequest,
  });
  const { clearRefreshFailure, confirmOwnAction } = notificationRefresh;
  const refreshAndIdle = useRefreshAndIdle({ refs, setters, refresh, clearRefreshFailure });
  const recover = useAdmissionRecovery({ refs, setters, client, checkViewer, clearIntent, refresh, refreshAndIdle, confirmOwnAction, setErrorMessage });
  const completeWrite = useAdmissionWriteCompletion({ refs, setters, applyState, clearIntent, refresh, refreshAndIdle, confirmOwnAction, setErrorMessage });
  const write = useAdmissionWrite({ refs, setters, accountChanged, checkViewer, client, whatsappClient, completeWrite, persist, legacyInvitationToken, setErrorMessage, captureActionFocus, finishActionFocus });
  const read = useAdmissionRead({ refs, setters, recover, refreshAndIdle, checkViewer, restoreDraft, setErrorMessage });
  return { applyState, checkViewer, ownRequestRefreshUnavailable: notificationRefresh.refreshUnavailable, persist, read, recover, restoreDraft, write };
}

/** @param contactState - Ready state. @param now - Expiry clock. @returns The pending own request that has not expired yet. */
function findCurrentPendingRequest(contactState: ReadyAdmissionState | null, now: string): OwnAdmissionRequest | null {
  return contactState?.request?.status === "pending" && new Date(contactState.request.expiresAt) > new Date(now || contactState.renderedAt) ? contactState.request : null;
}

/** A server-authorized new common presentation has its own recovery lineage; prior originals remain readable. */
function findPreviousRequestId(requestPage: boolean, contactState: ReadyAdmissionState | null, currentPending: OwnAdmissionRequest | null): string | undefined {
  return !requestPage && contactState?.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && contactState.request && !currentPending && contactState.request.status !== ADMISSION_REQUEST_STATUS.approved ? contactState.request.id : undefined;
}

/** @param contactState - Ready state. @param currentPending - Current pending request. @returns Whether the policy asks this viewer to verify a contact now. */
function shouldShowContact(contactState: ReadyAdmissionState | null, currentPending: OwnAdmissionRequest | null): boolean {
  return Boolean(contactState?.viewerId && contactState.overview.policy?.requiresAdditionalVerification && contactState.overview.verification && (contactState.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired || currentPending?.needsVerification));
}

type ContactOptionsInput = Pick<AdmissionContactHookOptions, "previousRequestId" | "legacyInvitationToken" | "arrivalScope" | "phone" | "country" | "enabled" | "authorize" | "client" | "onApplied" | "onStateChanged"> & { contactState: ReadyAdmissionState | null; currentPending: OwnAdmissionRequest | null };

/** @param input - Ready state, pending request, draft contact and callbacks. @returns The contact verification options of the current request. */
function buildContactVerificationOptions({ contactState, currentPending, ...rest }: ContactOptionsInput): AdmissionContactHookOptions {
  const contactOptions = contactState?.overview.verification;
  return { viewerId: contactState?.viewerId ?? null, slug: contactState?.overview.tribe.slug ?? "", requestId: currentPending?.id ?? null, requestVersion: currentPending?.version ?? null, previousRequestId: rest.previousRequestId, legacyInvitationToken: rest.legacyInvitationToken, arrivalScope: rest.arrivalScope, policyVersion: contactState?.overview.policy?.version ?? 1, channel: contactOptions?.channel ?? MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: contactOptions?.allowedCountries ?? [], allowSmsAlternative: contactOptions?.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms, phone: rest.phone, country: rest.country, enabled: rest.enabled, renderedAt: contactState?.renderedAt ?? "", authorize: rest.authorize, client: rest.client, onProof: () => {}, onApplied: rest.onApplied, onStateChanged: rest.onStateChanged };
}

type AdmissionContactOptions = { workflow: AdmissionWorkflow; requestPage: boolean; contactClient?: AdmissionContactBrowserClient; legacyInvitationToken?: string; arrivalScope?: string; applyState: (next: AdmissionPageState) => void; checkViewer: CheckViewer; read: () => Promise<void> };

/** Owns the contact verification of the current request and what it allows. */
function useAdmissionContact({ workflow, requestPage, contactClient, legacyInvitationToken, arrivalScope, applyState, checkViewer, read }: AdmissionContactOptions) {
  const { refs, values } = workflow;
  const contactState = values.state.kind === "ready" ? values.state : null, contactOptions = contactState?.overview.verification;
  const currentPending = findCurrentPendingRequest(contactState, values.now);
  const showContact = shouldShowContact(contactState, currentPending);
  const contact = useAdmissionContactVerification(buildContactVerificationOptions({ contactState, currentPending, previousRequestId: findPreviousRequestId(requestPage, contactState, currentPending), legacyInvitationToken, arrivalScope, phone: values.draft.phone, country: values.draft.country, enabled: showContact && values.formReady && !values.accountChanged && values.phase !== ADMISSION_UI_PHASE.uncertain, authorize: checkViewer, client: contactClient, onStateChanged: () => { void read(); }, onApplied: (result) => {
    const next = buildAppliedProofState(refs.currentStateRef.current, result);
    if (!next) return;
    applyState(next);
    // The incremental result confirms version/evidence; this own GET fills the newly attached masked contact without route refresh.
    void read();
  } }));
  const proofFresh = contact.proofFresh && !contact.recoveryRequired;
  const canSubmitWithProof = !requestPage && contactState?.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && proofFresh && !contact.pending;
  return { canSubmitWithProof, contact, contactBusy: isContactBusy(contact), contactOptions, contactState, currentPending, hasVerification: Boolean(showContact && contactOptions), proofFresh };
}

type AdmissionContactModel = ReturnType<typeof useAdmissionContact>;
type AdmissionActionOptions = { workflow: AdmissionWorkflow; contactModel: AdmissionContactModel; requestPage: boolean; persist: (intent: AdmissionPendingIntent | null) => boolean; write: (intent: AdmissionPendingIntent) => Promise<void> };

/** @param input - Workflow refs and the gates of the submission. @returns Whether a submission cannot start now. */
function isSubmitBlocked({ refs, overviewState, canSubmitWithProof, formReady, requestPage, contactBusy, contactPending }: { refs: AdmissionRefs; overviewState: string; canSubmitWithProof: boolean; formReady: boolean; requestPage: boolean; contactBusy: boolean; contactPending: boolean }): boolean {
  return Boolean(refs.busyRef.current || refs.pendingRef.current) || overviewState !== ADMISSION_OVERVIEW_STATE.available && !canSubmitWithProof || !formReady || requestPage || contactBusy || contactPending;
}

/** @param input - Validated draft, policy and proof. @returns The original submission body with only the declared optional fields. */
function buildSubmissionInput({ draft, policyVersion, whatsappNumber, proofId, phone }: { draft: AdmissionDraft; policyVersion: number; whatsappNumber: string | null; proofId: string | undefined; phone: ReturnType<typeof normalizeAdmissionContact> | null }) {
  return { operationId: newAdmissionOperationId(), confirmed: true as const, expectedPolicyVersion: policyVersion, ...(whatsappNumber ? { whatsappNumber } : {}), ...(proofId === undefined ? {} : { proofId }), ...(phone?.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid && phone.contact.type === ADMISSION_CONTACT_TYPE.phone ? { phone: phone.contact.value, country: phone.contact.country } : {}), ...(draft.message.trim() ? { message: draft.message.trim() } : {}) };
}

/** Draft edits and the submission of a new request. */
function createAdmissionSubmission({ workflow, contactModel, requestPage, persist, write }: AdmissionActionOptions) {
  const { refs, setters, values, viewFeedback: { setErrorMessage } } = workflow;
  const { contact, contactBusy, canSubmitWithProof, proofFresh } = contactModel;
  const changeDraft = (next: AdmissionDraft) => {
    if (refs.busyRef.current || refs.pendingRef.current) return;
    const normalizedDraft = contact.challenge || contact.pending ? { ...next, phone: refs.currentDraftRef.current.phone, country: refs.currentDraftRef.current.country } : next;
    if (normalizedDraft.whatsappNumber !== refs.currentDraftRef.current.whatsappNumber) { setters.setWhatsappValidationError(null); setters.setWhatsappEditError(null); setters.setWhatsappConfirmed(false); refs.whatsappConfirmationRef.current = null; }
    refs.currentDraftRef.current = normalizedDraft; setters.setDraft(normalizedDraft); setErrorMessage(null); setters.setFeedback(null); persist(null);
  };
  const submit = () => {
    const snapshot = refs.currentStateRef.current;
    if (snapshot.kind !== "ready" || !snapshot.overview.policy || isSubmitBlocked({ refs, overviewState: snapshot.overview.state, canSubmitWithProof, formReady: values.formReady, requestPage, contactBusy, contactPending: Boolean(contact.pending) })) return;
    if (!values.confirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    const policy = snapshot.overview.policy, draft = refs.currentDraftRef.current;
    /** With phone contact the contact phone is also the number compared with the group, so no separate number is asked or validated. */
    const whatsapp = policy.contactType === ADMISSION_CONTACT_TYPE.phone ? { valid: true as const, value: null } : validateBrowserAdmissionWhatsappNumberDraft(draft.whatsappNumber, policy.requiresWhatsappNumber ?? false);
    if (!whatsapp.valid) { setters.setWhatsappValidationError({ message: getAdmissionWhatsappNumberDraftMessage(whatsapp), policyVersion: policy.version }); return; }
    setters.setWhatsappValidationError(null);
    const phone = policy.contactType === ADMISSION_CONTACT_TYPE.phone ? normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: draft.phone, country: draft.country }) : null;
    if (draft.message.length > ADMISSION_LIMIT.internalMessageCharacters || phone && phone.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) { setErrorMessage(ADMISSION_UI_COPY.draftInvalid, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    if (policy.requiresAdditionalVerification && !proofFresh) { setErrorMessage(ADMISSION_UI_COPY.verifying, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    try { void write({ kind: "submit", input: buildSubmissionInput({ draft, policyVersion: policy.version, whatsappNumber: whatsapp.value, proofId: policy.requiresAdditionalVerification && contact.proof ? contact.proof.proofId : undefined, phone }) }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.submit); }
  };
  return { changeDraft, submit };
}

/** Cancellation and the WhatsApp correction of the current request. */
function createAdmissionRequestActions({ workflow, contactModel, write }: Omit<AdmissionActionOptions, "requestPage" | "persist">) {
  const { refs, setters, values, viewFeedback: { setErrorMessage } } = workflow;
  const { contact, contactBusy } = contactModel;
  /**
   * The page clock moves once a minute, so a request can reach its deadline while its actions still show: the click advances the clock,
   * which hides them, and says why instead of doing nothing or sending a write the server refuses.
   * @param request - Pending own request of the current state. @param origin - Action that was clicked.
   * @returns Whether the request already expired.
   */
  const reportExpiredRequest = (request: OwnAdmissionRequest, origin: AdmissionFeedbackOrigin) => {
    if (new Date(request.expiresAt).getTime() > Date.now()) return false;
    setters.setNow(new Date().toISOString()); setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.requestExpired], origin);
    return true;
  };
  const cancel = () => {
    const snapshot = refs.currentStateRef.current;
    if (refs.busyRef.current || refs.pendingRef.current || snapshot.kind !== "ready" || snapshot.request?.status !== "pending" || !values.formReady) return;
    if (reportExpiredRequest(snapshot.request, ADMISSION_FEEDBACK_ORIGIN.cancel)) return;
    if (!values.cancelConfirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.cancel); return; }
    try { void write({ kind: "cancel", requestId: snapshot.request.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: snapshot.request.version } }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.cancel); }
  };
  /** Captures the rendered own version, never a silently advanced background snapshot. */
  const confirmWhatsapp = (value: boolean) => {
    const { state } = values;
    if (refs.busyRef.current || refs.pendingRef.current || !values.formReady || values.accountChanged || state.kind !== "ready" || !state.request) return;
    refs.whatsappConfirmationRef.current = value ? { requestId: state.request.id, version: state.request.version, required: state.request.requiresWhatsappNumber ?? false } : null;
    setters.setWhatsappConfirmed(value); setErrorMessage(null);
  };
  /** Validates the current rule before retaining an immutable correction alongside the existing recovery engine. */
  const saveWhatsapp = () => {
    const snapshot = refs.currentStateRef.current, observed = refs.whatsappConfirmationRef.current;
    if (refs.busyRef.current || refs.pendingRef.current || values.accountChanged || snapshot.kind !== "ready" || snapshot.request?.status !== ADMISSION_REQUEST_STATUS.pending || !values.formReady || contactBusy || contact.recoveryRequired) return;
    if (reportExpiredRequest(snapshot.request, ADMISSION_FEEDBACK_ORIGIN.whatsapp)) return;
    if (!values.whatsappConfirmed || !observed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.whatsapp); return; }
    const required = snapshot.request.requiresWhatsappNumber ?? false;
    if (observed.requestId !== snapshot.request.id || observed.version !== snapshot.request.version || observed.required !== required) { setters.setWhatsappConfirmed(false); refs.whatsappConfirmationRef.current = null; setErrorMessage(ADMISSION_WHATSAPP_COPY.stale, ADMISSION_FEEDBACK_ORIGIN.whatsapp); return; }
    const value = validateBrowserAdmissionWhatsappNumberDraft(refs.currentDraftRef.current.whatsappNumber ?? snapshot.request.whatsappNumber ?? undefined, required);
    if (!value.valid) { setters.setWhatsappEditError({ requestId: snapshot.request.id, version: snapshot.request.version, required, message: getAdmissionWhatsappNumberDraftMessage(value) }); return; }
    setters.setWhatsappEditError(null);
    try { void write({ kind: ADMISSION_WHATSAPP_INTENT_KIND, requestId: snapshot.request.id, input: { operationId: newAdmissionOperationId(), expectedVersion: observed.version, confirmed: true, whatsappNumber: value.value } }); }
    catch { setErrorMessage(ADMISSION_WHATSAPP_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.whatsapp); }
  };
  return { cancel, confirmWhatsapp, saveWhatsapp };
}

/** @returns An account change that signs out only when the overview asks for another account, then opens sign-in with Google's account chooser and this entry as its return path. */
function createAdmissionAccountChange({ workflow, accountClient, accountChangeHref }: { workflow: AdmissionWorkflow; accountClient: AdmissionAccountBrowserClient; accountChangeHref: string }) {
  const { refs, setters, values, viewFeedback: { setErrorMessage } } = workflow;
  return async () => {
    if (refs.busyRef.current || refs.pendingRef.current || values.accountChanged) return;
    refs.busyRef.current = true; setters.setChangingAccount(true); setErrorMessage(null);
    const request = new AbortController(); refs.controllerRef.current?.abort(); refs.controllerRef.current = request;
    // After a confirmed sign-out the page is leaving: its actions stay disabled until the sign-in document replaces it.
    let leaving = false;
    try {
      const result = await accountClient.changeAccount(request.signal);
      if (!isLive(refs.activeRef, request.signal)) return;
      if (result.status === "ready") { leaving = true; replaceCurrentPageWithUrl(accountChangeHref); return; }
      if (result.status === "failed") setErrorMessage(result.message);
    } finally { if (!leaving && refs.controllerRef.current === request) { refs.busyRef.current = false; if (refs.activeRef.current) setters.setChangingAccount(false); } }
  };
}

/** A landed code write opens the next step; resuming opens the first step still pending. */
function useMilestoneStep(milestone: AdmissionRequestFlowStep | null, flowMode: string, flowSteps: readonly AdmissionRequestFlowStep[], setStep: (step: number) => void) {
  const [seenMilestone, setSeenMilestone] = useState<string | null>(null);
  const milestoneKey = milestone ? `${flowMode}:${milestone}` : null;
  if (milestoneKey !== seenMilestone) { setSeenMilestone(milestoneKey); if (milestone) setStep(flowSteps.indexOf(milestone)); }
}

/** An unconfirmed code operation blocks the flow, so its read is the one next action. */
function AdmissionContactRecovery({ contact, contactBusy }: { contact: AdmissionContactState; contactBusy: boolean }) {
  return <><Button type="button" variant="secondary" disabled={contactBusy} onClick={() => void contact.readOriginal()}>Consultar operación del código</Button>{contact.canDiscardAbsent && <Button type="button" variant="ghost" disabled={contactBusy} onClick={() => void contact.discardAbsent()}>Descartar la referencia y pedir otro código</Button>}</>;
}

type RequestStepsProps = ComponentProps<typeof AdmissionRequestSteps>;
type VerificationInput = { contactModel: AdmissionContactModel; values: AdmissionWorkflow["values"]; changeDraft: (next: AdmissionDraft) => void };

/** @param contact - Contact verification state. @param contactOptions - Policy verification options. @returns Which contact actions are available now. */
function buildVerificationCapabilities(contact: AdmissionContactState, contactOptions: NonNullable<AdmissionContactModel["contactOptions"]>) {
  return { canIssue: contact.ready && !contact.pending && !contact.challenge, canVerify: contact.ready && !contact.pending && !contact.proof, canResend: contact.ready && !contact.pending, canUseSmsAlternative: contactOptions.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms && contact.ready && !contact.pending, contactLocked: Boolean(contact.challenge || contact.pending) };
}

/** @param input - Contact model, workflow values and the draft editor. @returns The verification step of the request flow, or null without verification. */
function buildRequestVerification({ contactModel, values, changeDraft }: VerificationInput): RequestStepsProps["verification"] {
  const { contact, contactBusy, contactOptions, hasVerification, proofFresh } = contactModel;
  if (!hasVerification || !contactOptions) return null;
  const { draft, phase } = values;
  /** @param next - Draft with the edited contact field. */
  const changeContact = (next: AdmissionDraft) => { if (!contact.pending && !contactBusy) { contact.clearFieldFeedback(); changeDraft(next); } };
  return { ready: contact.ready && !contact.recoveryRequired && values.formReady && !values.accountChanged, channel: contactOptions.channel, phone: draft.phone, country: draft.country, verificationCode: contact.code, confirmed: contact.confirmed, busy: contactBusy || phase === ADMISSION_UI_PHASE.writing || phase === ADMISSION_UI_PHASE.checking, ...buildVerificationCapabilities(contact, contactOptions), allowedCountries: contactOptions.allowedCountries, challenge: contact.challenge ? { ...contact.challenge, deliveryState: contact.delivery?.state ?? contact.challenge.deliveryState } : null, challengeUnavailable: contact.challengeUnavailable, requiresReplacement: contact.requiresReplacement, proofReady: proofFresh, proofExpired: Boolean(contact.proof && !proofFresh), expiresInSeconds: contact.expiresInSeconds, resendInSeconds: contact.resendInSeconds, errorMessage: contact.errorMessage ?? contact.challengeMessage ?? contact.deliveryMessage, feedback: contact.feedback, fieldErrors: contact.fieldErrors, onPhoneChange: (phone) => changeContact({ ...draft, phone }), onCountryChange: (country) => changeContact({ ...draft, country }), onCodeChange: contact.setCode, onConfirm: contact.setConfirmed, onIssue: () => void contact.issue(), onResend: () => void contact.resend(), onVerify: () => void contact.verify(), onUseSmsAlternative: () => void contact.useSmsAlternative() };
}

type FlowInput = { workflow: AdmissionWorkflow; contactModel: AdmissionContactModel; contactState: ReadyAdmissionState; flowMode: string; flowBlocked: boolean; submitErrorMessage: string | null; changeDraft: (next: AdmissionDraft) => void; submit: () => void };

/** @param input - Workflow values, contact model and handlers. @returns The data step of the request flow. */
function buildRequestForm({ workflow, contactModel, contactState, flowBlocked, submitErrorMessage, changeDraft }: FlowInput): RequestStepsProps["form"] {
  const { values, setters, viewFeedback: { setErrorMessage } } = workflow;
  const { contact } = contactModel;
  const policy = contactState.overview.policy;
  return { draft: values.draft, contactType: policy?.contactType ?? "email", contactLocked: Boolean(contact.challenge || contact.pending), showWhatsappNumber: values.formReady && !values.accountChanged && policy?.contactType !== ADMISSION_CONTACT_TYPE.phone, requiresWhatsappNumber: policy?.requiresWhatsappNumber ?? false, whatsappErrorMessage: currentWhatsappValidationMessage(values.state, values.whatsappValidationError), confirmed: values.confirmed, disabled: flowBlocked, busy: values.phase === ADMISSION_UI_PHASE.writing, errorMessage: submitErrorMessage, onChange: changeDraft, onConfirm: (value) => { setters.setConfirmed(value); setErrorMessage(null); } };
}

/** @param input - Workflow values, contact model and handlers. @returns The final action: applying a proof to a pending request, or submitting a new one. */
function buildFinalAction({ workflow, contactModel, contactState, flowMode, flowBlocked, submit }: FlowInput): RequestStepsProps["finalAction"] {
  const { contact, contactBusy, proofFresh, hasVerification, canSubmitWithProof } = contactModel;
  const { phase, writingWhatsapp, confirmed } = workflow.values;
  if (flowMode === ADMISSION_REQUEST_FLOW_MODE.apply) return { label: ADMISSION_REQUEST_FLOW_COPY.applyAction, loading: contact.phase === ADMISSION_CONTACT_PHASE.applying, disabled: !proofFresh || Boolean(contact.pending) || contactBusy && contact.phase !== ADMISSION_CONTACT_PHASE.applying, onRun: () => void contact.apply() };
  return { label: ADMISSION_UI_COPY.submit, loading: phase === ADMISSION_UI_PHASE.writing && !writingWhatsapp, disabled: !confirmed || flowBlocked && (phase !== ADMISSION_UI_PHASE.writing || writingWhatsapp) || hasVerification && !canSubmitWithProof && contactState.overview.state !== ADMISSION_OVERVIEW_STATE.available, onRun: submit };
}

/** @param input - Ready state, request mode and pending request. @returns Whether the page offers a new submission. */
function offersNewSubmission({ contactState, requestPage, currentPending, hasVerification }: { contactState: ReadyAdmissionState | null; requestPage: boolean; currentPending: OwnAdmissionRequest | null; hasVerification: boolean }): boolean {
  if (contactState === null || requestPage || currentPending) return false;
  const overviewState = contactState.overview.state;
  return (overviewState === ADMISSION_OVERVIEW_STATE.available || overviewState === ADMISSION_OVERVIEW_STATE.verificationRequired && hasVerification) && contactState.request?.status !== ADMISSION_REQUEST_STATUS.pending;
}

/** @param contactState - Ready state. @param draft - Current draft. @returns Why the data step cannot move on: the declared WhatsApp is checked before leaving it. */
function detailsBlockedReasonOf(contactState: ReadyAdmissionState | null, draft: AdmissionDraft): string | undefined {
  const policy = contactState?.overview.policy;
  if (!policy || policy.contactType === ADMISSION_CONTACT_TYPE.phone) return undefined;
  const whatsappDraft = validateBrowserAdmissionWhatsappNumberDraft(draft.whatsappNumber, policy.requiresWhatsappNumber ?? false);
  return whatsappDraft.valid ? undefined : getAdmissionWhatsappNumberDraftMessage(whatsappDraft);
}

/** @param input - Workflow values, contact model and ready state. @returns Whether the pending request offers the WhatsApp correction. */
function showsWhatsappEditorFor({ values, currentPending }: { values: AdmissionWorkflow["values"]; currentPending: OwnAdmissionRequest | null }): boolean {
  return Boolean(values.formReady && !values.accountChanged && currentPending && values.state.kind === "ready" && values.state.overview.policy?.contactType !== ADMISSION_CONTACT_TYPE.phone && (currentPending.requiresWhatsappNumber !== undefined || currentPending.whatsappNumber !== undefined));
}

type PresentationInput = { workflow: AdmissionWorkflow; contactModel: AdmissionContactModel; requestPage: boolean; changeDraft: (next: AdmissionDraft) => void; submit: () => void };

/** Decides the request flow mode and step, and where each error is shown. */
function useAdmissionPresentation({ workflow, contactModel, requestPage, changeDraft, submit }: PresentationInput) {
  const { values, setters, viewFeedback: { errorMessage, errorOrigin } } = workflow;
  const { contact, contactBusy, contactState, currentPending, hasVerification, proofFresh } = contactModel;
  const flowMode = currentPending && hasVerification ? ADMISSION_REQUEST_FLOW_MODE.apply : ADMISSION_REQUEST_FLOW_MODE.submit;
  const flowSteps = admissionRequestFlowSteps(flowMode, hasVerification);
  useMilestoneStep(resolveMilestone({ hasVerification, proofFresh, hasChallenge: Boolean(contact.challenge) }), flowMode, flowSteps, setters.setStep);
  const offersSubmission = offersNewSubmission({ contactState, requestPage, currentPending, hasVerification });
  const flowBlocked = values.phase !== ADMISSION_UI_PHASE.idle || values.accountChanged || !values.formReady || contactBusy;
  const showsWhatsappEditor = showsWhatsappEditorFor({ values, currentPending });
  // Each error shows once, next to the step, action or field that produced it; when the page no longer offers that place, on the page itself.
  // A submission error stays in the final step only while that step is open; a resend from the page's recovery shows it on the page.
  const errorAnchored = isErrorAnchored({ errorOrigin, offersSubmitStep: offersSubmission && flowMode === ADMISSION_REQUEST_FLOW_MODE.submit && values.step === flowSteps.length - 1, offersCancel: values.state.kind === "ready" && values.state.request !== null && !values.accountChanged, showsWhatsappEditor });
  const placedErrorOrigin = errorAnchored ? errorOrigin : ADMISSION_FEEDBACK_ORIGIN.page;
  const errorAt = (origin: AdmissionFeedbackOrigin) => placedErrorOrigin === origin ? errorMessage : null;
  const flowInput = contactState && (offersSubmission || flowMode === ADMISSION_REQUEST_FLOW_MODE.apply) ? { workflow, contactModel, contactState, flowMode, flowBlocked, submitErrorMessage: errorAt(ADMISSION_FEEDBACK_ORIGIN.submit), changeDraft, submit } : null;
  const requestFlow = flowInput ? <AdmissionRequestSteps mode={flowMode} step={values.step} onStepChange={setters.setStep} busy={flowBlocked}
    issuing={contact.phase === ADMISSION_CONTACT_PHASE.issuing} verifying={contact.phase === ADMISSION_CONTACT_PHASE.verifying} verification={buildRequestVerification({ contactModel, values, changeDraft })} recovery={hasVerification && contact.challenge?.deliveryId ? <Button type="button" variant="secondary" size="sm" disabled={contactBusy} onClick={() => void contact.readDelivery()}>Consultar envío del código</Button> : undefined}
    form={buildRequestForm(flowInput)} finalAction={buildFinalAction(flowInput)}
    detailsBlockedReason={detailsBlockedReasonOf(contactState, values.draft)} finalBlockedReason={finalBlockedReasonOf(hasVerification, proofFresh, flowMode)} /> : undefined;
  return { errorAt, requestFlow, showsWhatsappEditor };
}

/** @param props - Validated SSR snapshot, fixed own-detail mode and application transport port. @returns Presenters only; writes never trigger a route refresh. */
export function AdmissionContainer({ initialState, requestPage = false, client = admissionApiClient, whatsappClient = admissionApiClient, accountClient = admissionApiClient, contactClient, legacyInvitationToken, arrivalScope, arrivalReturnPath }: AdmissionContainerProps) {
  const workflow = useAdmissionWorkflowState(initialState);
  const { refs, setters, values } = workflow;
  const { state, accountChanged, draft, phase } = values;
  const targetRequestId = requestPage && initialState.kind === "ready" ? initialState.request?.id : undefined;
  const { resultRef, captureActionFocus, finishActionFocus } = useReplacedActionFocus({
    scopeKey: state.kind === "ready" ? `${state.viewerId ?? ""}:${state.overview.tribe.slug}` : "",
    resultKey: state.kind === "ready" ? `${state.request?.id ?? ""}:${state.request?.status ?? ""}` : "",
    enabled: state.kind === "ready" && !accountChanged,
  });
  const engine = useAdmissionEngine({ workflow, client, whatsappClient, legacyInvitationToken, arrivalScope, targetRequestId, captureActionFocus, finishActionFocus });
  const contactModel = useAdmissionContact({ workflow, requestPage, contactClient, legacyInvitationToken, arrivalScope, applyState: engine.applyState, checkViewer: engine.checkViewer, read: engine.read });
  const { contact, contactBusy, canSubmitWithProof, currentPending, hasVerification } = contactModel;
  useAdmissionLifecycle({ refs, setters, checkViewer: engine.checkViewer, recover: engine.recover, read: engine.read, restoreDraft: engine.restoreDraft, setErrorMessage: workflow.viewFeedback.setErrorMessage });
  const { changeDraft, submit } = createAdmissionSubmission({ workflow, contactModel, requestPage, persist: engine.persist, write: engine.write });
  const { cancel, confirmWhatsapp, saveWhatsapp } = createAdmissionRequestActions({ workflow, contactModel, write: engine.write });
  const signInHref = `${ROUTES.auth.signIn}?${new URLSearchParams({ callbackUrl: resolveReturnPath({ arrivalReturnPath, requestPage, state }) })}`;
  const changeAccount = createAdmissionAccountChange({ workflow, accountClient, accountChangeHref: buildAccountChangeSignInUrl(resolveAccountChangeReturnPath({ arrivalReturnPath, state })) });
  const retryHref = state.kind === "ready" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}` : undefined;
  const { errorAt, requestFlow, showsWhatsappEditor } = useAdmissionPresentation({ workflow, contactModel, requestPage, changeDraft, submit });
  const contactRecovery = hasVerification && (contact.pending || contact.recoveryRequired) ? <AdmissionContactRecovery contact={contact} contactBusy={contactBusy} /> : undefined;
  const whatsappEditor = showsWhatsappEditor && currentPending ? <AdmissionWhatsappNumberForm value={draft.whatsappNumber ?? currentPending.whatsappNumber ?? ""} currentNumber={currentPending.whatsappNumber ?? null} required={currentPending.requiresWhatsappNumber ?? false} confirmed={values.whatsappConfirmed} disabled={phase !== ADMISSION_UI_PHASE.idle || contactBusy || contact.recoveryRequired} busy={phase === ADMISSION_UI_PHASE.writing && values.writingWhatsapp} errorMessage={currentWhatsappEditMessage(currentPending, values.whatsappEditError)} actionErrorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.whatsapp)} onChange={(whatsappNumber) => changeDraft({ ...draft, whatsappNumber })} onConfirm={confirmWhatsapp} onSubmit={saveWhatsapp} /> : undefined;
  return <AdmissionScreen state={state} requestStatusRef={resultRef} requestPage={requestPage} requestFlow={requestFlow} contactRecovery={contactRecovery} whatsappEditor={whatsappEditor} changingAccount={values.changingAccount} onChangeAccount={() => void changeAccount()} canSubmitWithProof={canSubmitWithProof} contactLocked={Boolean(contact.challenge || contact.pending)} draft={draft} whatsappErrorMessage={currentWhatsappValidationMessage(state, values.whatsappValidationError)} confirmed={values.confirmed} cancelConfirmed={values.cancelConfirmed} phase={phase} now={values.now} errorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.page) ?? (engine.ownRequestRefreshUnavailable ? ADMISSION_UI_COPY.readFailed : null)} cancelErrorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.cancel)} onRetryUnavailable={reloadCurrentPage} feedback={values.feedback} accountChanged={accountChanged} formReady={values.formReady && !contactBusy && !contact.recoveryRequired} retryOriginal={values.retryOriginal} signInHref={signInHref} retryHref={retryHref}
    onChange={changeDraft} onConfirm={(value) => { setters.setConfirmed(value); workflow.viewFeedback.setErrorMessage(null); }} onCancelConfirm={(value) => { setters.setCancelConfirmed(value); workflow.viewFeedback.setErrorMessage(null); }} onSubmit={submit} onCancel={cancel} onRead={() => void engine.read()} onRetryOriginal={() => { if (refs.canRetryOriginalRef.current && refs.pendingRef.current) void engine.write(refs.pendingRef.current); }}
    onReloadAccount={() => { window.location.reload(); /* An actual authentication change requires a fresh server snapshot. */ }} />;
}
