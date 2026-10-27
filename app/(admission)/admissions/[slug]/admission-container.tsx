"use client";

/** Owns the single browser workflow, native viewer checks and durable local intent recovery. @module admission-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, toast } from "@golfo/ui";
import { AdmissionRequestSteps } from "@/components/academy-admissions/admission-request-steps";
import { startWriteToast, type WriteToast } from "@/lib/toasts/write-toast";
import { ADMISSION_REQUEST_FLOW_COPY, ADMISSION_REQUEST_FLOW_MODE, admissionRequestFlowSteps, type AdmissionRequestFlowStep } from "@/src/modules/academy-admissions/constants/admission-request-flow";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
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
import type { AdmissionAccountBrowserClient, AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { reloadCurrentPage, replaceCurrentPageWithUrl } from "@/lib/browser-navigation";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { getOwnAdmissionRequestMessage } from "@/src/modules/academy-admissions/application/results/admission-own-request-message";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { readAdmissionDraft, writeAdmissionDraft, newAdmissionOperationId, type AdmissionDraft, type AdmissionPendingIntent } from "@/lib/academy-admissions/admission-draft";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
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
import { ROUTES } from "@/src/constants/routes";
import { validateBrowserAdmissionWhatsappNumberDraft } from "@/src/modules/academy-admissions/infrastructure/browser/validate-admission-whatsapp-number-draft";
import { getAdmissionWhatsappNumberDraftMessage } from "@/src/modules/academy-admissions/application/results/admission-whatsapp-number-draft-message";
import { AdmissionWhatsappNumberForm } from "@/components/academy-admissions/admission-whatsapp-number-form";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";
import { ADMISSION_WHATSAPP_COPY, ADMISSION_WHATSAPP_INTENT_KIND, ADMISSION_WHATSAPP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";

/** Submission refusals that the current overview may explain as needing another account. */
const ACCOUNT_CHANGE_SUBMISSION_CODES: ReadonlySet<string> = new Set([ADMISSION_ERROR_CODE.admissionIneligible, ADMISSION_ERROR_CODE.contactBindingConflict]);

/** @param intent - A write the applicant started. @returns The step or action whose error it is: the submission, the cancellation or the WhatsApp correction. */
function feedbackOriginOf(intent: AdmissionPendingIntent): AdmissionFeedbackOrigin {
  return intent.kind === "submit" ? ADMISSION_FEEDBACK_ORIGIN.submit : intent.kind === "cancel" ? ADMISSION_FEEDBACK_ORIGIN.cancel : ADMISSION_FEEDBACK_ORIGIN.whatsapp;
}

/** Do not replace a confirmed newer resource snapshot with a historical operation result. */
function retainCurrentRequest(current: AdmissionRequestDto | null, incoming: AdmissionRequestDto | null): AdmissionRequestDto | null {
  return current && incoming && current.id === incoming.id && current.version > incoming.version ? current : incoming;
}

/** @param props - Validated SSR snapshot, fixed own-detail mode and application transport port. @returns Presenters only; writes never trigger a route refresh. */
export function AdmissionContainer({ initialState, requestPage = false, client = admissionApiClient, whatsappClient = admissionApiClient, accountClient = admissionApiClient, contactClient, legacyInvitationToken, arrivalScope, arrivalReturnPath }: { initialState: AdmissionPageState; requestPage?: boolean; client?: AdmissionBrowserClient; accountClient?: AdmissionAccountBrowserClient; whatsappClient?: Pick<AdmissionWhatsappNumberBrowserClient, "updateWhatsappNumber">; contactClient?: AdmissionContactBrowserClient; legacyInvitationToken?: string; arrivalScope?: string; arrivalReturnPath?: string }) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<AdmissionDraft>({ phone: "", country: "", message: "" });
  const [confirmed, setConfirmed] = useState(false), [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [phase, setPhase] = useState<typeof ADMISSION_UI_PHASE[keyof typeof ADMISSION_UI_PHASE]>(ADMISSION_UI_PHASE.idle);
  const { errorMessage, errorOrigin, setErrorMessage, setReadErrorMessage, clearReadError } = useAdmissionViewFeedback();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [whatsappValidationError, setWhatsappValidationError] = useState<{ message: string; policyVersion: number } | null>(null);
  const [whatsappConfirmed, setWhatsappConfirmed] = useState(false);
  const [writingWhatsapp, setWritingWhatsapp] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const [whatsappEditError, setWhatsappEditError] = useState<{ requestId: string; version: number; required: boolean; message: string } | null>(null);
  const whatsappConfirmation = useRef<{ requestId: string; version: number; required: boolean } | null>(null);
  const [formReady, setFormReady] = useState(false), [accountChanged, setAccountChanged] = useState(false), [retryOriginal, setRetryOriginal] = useState(false);
  const [now, setNow] = useState(initialState.kind === "ready" ? initialState.renderedAt : "");
  const currentState = useRef(initialState), currentDraft = useRef(draft), pending = useRef<AdmissionPendingIntent | null>(null);
  const active = useRef(false), busy = useRef(false), canRetryOriginal = useRef(false), controller = useRef<AbortController | null>(null);
  const draftLoaded = useRef(false), writeToast = useRef<WriteToast | null>(null);
  const [step, setStep] = useState(0);
  const targetRequestId = requestPage && initialState.kind === "ready" ? initialState.request?.id : undefined;
  const { resultRef, captureActionFocus, finishActionFocus } = useReplacedActionFocus({
    scopeKey: state.kind === "ready" ? `${state.viewerId ?? ""}:${state.overview.tribe.slug}` : "",
    resultKey: state.kind === "ready" ? `${state.request?.id ?? ""}:${state.request?.status ?? ""}` : "",
    enabled: state.kind === "ready" && !accountChanged,
  });

  /** Publishes only the current container's snapshot. */
  const applyState = useCallback((next: AdmissionPageState) => {
    const previous = currentState.current;
    if (previous.kind === "ready" && next.kind === "ready" && (previous.request?.id !== next.request?.id || previous.request?.version !== next.request?.version || previous.request?.requiresWhatsappNumber !== next.request?.requiresWhatsappNumber)) { whatsappConfirmation.current = null; setWhatsappConfirmed(false); }
    currentState.current = next; setState(next);
  }, []);
  const live = (signal: AbortSignal) => active.current && !signal.aborted;

  /** Saves the original body before dispatch; unavailable storage blocks a new write. */
  const persist = useCallback((intent: AdmissionPendingIntent | null) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return false;
    if (legacyInvitationToken && !arrivalScope) return false;
    try { writeAdmissionDraft({ viewerId: snapshot.viewerId, slug: snapshot.overview.tribe.slug, draft: currentDraft.current, pending: intent, ...(arrivalScope ? { arrivalScope } : {}) }); return true; }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, intent ? feedbackOriginOf(intent) : ADMISSION_FEEDBACK_ORIGIN.page); return false; }
  }, [arrivalScope, legacyInvitationToken, setErrorMessage]);

  /** @param signal - Original operation cancellation. @param quiet - Leaves background transport feedback with its refresh owner. @returns Whether the current native viewer may retain this account's draft and actions. */
  const checkViewer = useCallback(async (signal: AbortSignal, quiet = false): Promise<boolean> => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready") return false;
    const result = await client.viewer(signal);
    if (!active.current || signal.aborted) return false;
    if (result.status !== "ready") { if (result.status === "failed" && !quiet) setReadErrorMessage(ADMISSION_UI_COPY.readFailed); return false; }
    if ((result.value?.id ?? null) !== snapshot.viewerId) { setAccountChanged(true); setFormReady(false); setErrorMessage(ADMISSION_UI_COPY.accountChanged); return false; }
    setFormReady(draftLoaded.current || snapshot.viewerId === null);
    return true;
  }, [client, setErrorMessage, setReadErrorMessage]);

  /** @param signal - Original current own read. @param quiet - Preserves form state and uses the scheduler's failure feedback. @returns Current own freshness without substituting it into the original ledger response. */
  const refresh = useCallback(async (signal: AbortSignal, quiet = false): Promise<AdmissionNotificationRefreshOutcome> => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || quiet && (busy.current || pending.current)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    if (!await checkViewer(signal, quiet)) return signal.aborted ? NOTIFICATION_REFRESH_OUTCOME.skipped : NOTIFICATION_REFRESH_OUTCOME.failed;
    const [overview, own] = await Promise.all([
      client.overview(snapshot.overview.tribe.slug, signal),
      snapshot.viewerId ? client.own(snapshot.overview.tribe.slug, targetRequestId, signal) : Promise.resolve({ status: "ready" as const, value: null }),
    ]);
    if (!active.current || signal.aborted || quiet && (busy.current || pending.current)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    if (!await checkViewer(signal, quiet)) return signal.aborted ? NOTIFICATION_REFRESH_OUTCOME.skipped : NOTIFICATION_REFRESH_OUTCOME.failed;
    if (overview.status !== "ready" || own.status !== "ready" || overview.value.tribe.slug !== snapshot.overview.tribe.slug || targetRequestId && own.value?.id !== targetRequestId) { if (!quiet) setReadErrorMessage(ADMISSION_UI_COPY.readFailed); return NOTIFICATION_REFRESH_OUTCOME.failed; }
    if (quiet && (busy.current || pending.current)) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    const current = currentState.current;
    if (current.kind !== "ready" || current.viewerId !== snapshot.viewerId || current.overview.tribe.slug !== snapshot.overview.tribe.slug) return NOTIFICATION_REFRESH_OUTCOME.skipped;
    const request = retainCurrentRequest(current.request, own.value);
    // Both projections are owned JSON contracts. Their dynamic rendering clock
    // is excluded so an equal read cannot replace form state or row identities.
    if (JSON.stringify(current.overview) !== JSON.stringify(overview.value) || JSON.stringify(current.request) !== JSON.stringify(request)) applyState({ ...current, overview: overview.value, request, renderedAt: new Date().toISOString() });
    if (!quiet) setNow(new Date().toISOString());
    clearReadError();
    return NOTIFICATION_REFRESH_OUTCOME.refreshed;
  }, [client, checkViewer, applyState, targetRequestId, setReadErrorMessage, clearReadError]);

  const refreshVisibleRequest = useCallback((signal: AbortSignal) => refresh(signal, true), [refresh]);
  const { refreshUnavailable: ownRequestRefreshUnavailable, clearRefreshFailure, confirmOwnAction } = useAdmissionNotificationRefresh({
    enabled: state.kind === "ready" && Boolean(state.viewerId) && !accountChanged,
    paused: state.kind !== "ready" || state.request?.status !== ADMISSION_REQUEST_STATUS.pending || phase !== ADMISSION_UI_PHASE.idle,
    scopeKey: state.kind === "ready" ? `${state.viewerId ?? ""}:${state.overview.tribe.slug}:${state.request?.id ?? ""}` : "",
    refresh: refreshVisibleRequest,
  });

  /** Clears only a known final local intent; storage failures never turn that result into a new write. */
  const clearIntent = useCallback(() => { pending.current = null; canRetryOriginal.current = false; setRetryOriginal(false); persist(null); }, [persist]);

  /** A bfcache page must reload the original intent stored by a later document in this tab. */
  const restoreDraft = useCallback(() => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    if (legacyInvitationToken && !arrivalScope) { setFormReady(false); return; }
    const record = readAdmissionDraft(snapshot.viewerId, snapshot.overview.tribe.slug, arrivalScope);
    if (record) { currentDraft.current = record.draft; setDraft(record.draft); pending.current = record.pending; }
    draftLoaded.current = true; setFormReady(true);
    setConfirmed(false); setCancelConfirmed(false); setWhatsappConfirmed(false); whatsappConfirmation.current = null; canRetryOriginal.current = false; setRetryOriginal(false);
  }, [arrivalScope, legacyInvitationToken]);

  /** Retrieves original registered state without issuing a POST or fabricating acceptance. */
  const recover = useCallback(async (signal: AbortSignal) => {
    const snapshot = currentState.current, intent = pending.current;
    if (snapshot.kind !== "ready" || !intent || !await checkViewer(signal)) return;
    canRetryOriginal.current = false; setRetryOriginal(false);
    const result = await client.operation(snapshot.overview.tribe.slug, intent.input.operationId, signal);
    if (!active.current || signal.aborted || !await checkViewer(signal)) return;
    if (result.status !== "ready") {
      if (result.status === "failed" && result.code === ADMISSION_ERROR_CODE.resourceUnavailable) { canRetryOriginal.current = true; setRetryOriginal(true); setFeedback(ADMISSION_UI_COPY.absent); }
      else if (result.status === "failed") setErrorMessage(result.message);
      setPhase(ADMISSION_UI_PHASE.uncertain); return;
    }
    const operation = result.value;
    const expectedType = intent.kind === "submit" ? ADMISSION_OPERATION_TYPE.submit : intent.kind === "cancel" ? ADMISSION_OPERATION_TYPE.cancel : ADMISSION_WHATSAPP_OPERATION;
    if (operation.operationId !== intent.input.operationId.toLowerCase() || operation.type !== expectedType) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (operation.state !== "completed") { setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if ("code" in operation.result) {
      const expectedRequestId = intent.kind === "submit" ? null : intent.requestId.toLowerCase();
      if (operation.result.admissionRequestId !== expectedRequestId) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      clearIntent(); setFeedback(""); setErrorMessage(ADMISSION_ERROR_MESSAGE[operation.result.code]);
      await refresh(signal); if (active.current && !signal.aborted) setPhase(ADMISSION_UI_PHASE.idle);
      return;
    }
    if (operation.type === ADMISSION_OPERATION_TYPE.cancel && intent.kind === "cancel" && (operation.result.admissionRequestId !== intent.requestId || operation.result.status !== "cancelled")) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (operation.type === ADMISSION_WHATSAPP_OPERATION && (intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND || operation.result.admissionRequestId !== intent.requestId.toLowerCase() || operation.result.version !== intent.input.expectedVersion + (operation.result.changed ? 1 : 0))) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    clearIntent(); setWhatsappConfirmed(false); whatsappConfirmation.current = null;
    toast.success(operation.type === ADMISSION_OPERATION_TYPE.submit ? operation.result.outcome === ADMISSION_OUTCOME.pending ? ADMISSION_UI_COPY.outcomePending : ADMISSION_UI_COPY.outcomeMember : operation.type === ADMISSION_WHATSAPP_OPERATION ? operation.result.changed ? ADMISSION_WHATSAPP_COPY.saved : ADMISSION_WHATSAPP_COPY.unchanged : ADMISSION_UI_COPY.cancelled);
    confirmOwnAction();
    if (await refresh(signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed) clearRefreshFailure();
    if (active.current && !signal.aborted) setPhase(ADMISSION_UI_PHASE.idle);
  }, [client, checkViewer, clearIntent, refresh, clearRefreshFailure, confirmOwnAction, setErrorMessage]);

  /** Applies minimal confirmed mutation data while the current projection is reconciled. */
  const completeWrite = useCallback(async (intent: AdmissionPendingIntent, result: Awaited<ReturnType<AdmissionBrowserClient["submit"]>> | Awaited<ReturnType<AdmissionBrowserClient["cancel"]>> | Awaited<ReturnType<AdmissionWhatsappNumberBrowserClient["updateWhatsappNumber"]>>, signal: AbortSignal) => {
    if (!live(signal)) return;
    if (result.status === "aborted") { setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (result.status === "failed") {
      // A failed request, cancellation or correction stays next to the step or action that sent it; the toast only closes.
      // An uncertain one belongs to the page, whose reads recover the original operation.
      if (result.uncertain) { setErrorMessage(result.message); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      setErrorMessage(result.message, feedbackOriginOf(intent));
      clearIntent(); if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND) { setWhatsappConfirmed(false); whatsappConfirmation.current = null; await refresh(signal); }
      // A list or contact-binding refusal can follow a change made after this page loaded; the current overview then explains it and offers another account.
      if (intent.kind === "submit" && ACCOUNT_CHANGE_SUBMISSION_CODES.has(result.code) && await refresh(signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed) {
        const current = currentState.current;
        if (live(signal) && current.kind === "ready" && current.overview.nextAction === ADMISSION_NEXT_ACTION.changeAccount) setErrorMessage(null);
      }
      if (live(signal)) setPhase(ADMISSION_UI_PHASE.idle);
      return;
    }
    if ("state" in result.value) { setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready") return;
    if ("outcome" in result.value) {
      const request = result.value.outcome === ADMISSION_OUTCOME.pending ? retainCurrentRequest(snapshot.request, result.value.request) : snapshot.request;
      applyState({ ...snapshot, request });
      writeToast.current?.announce({ kind: "success", message: result.value.safeMessage });
    } else if ("changed" in result.value) {
      if (intent.kind !== ADMISSION_WHATSAPP_INTENT_KIND || result.value.admissionRequestId !== intent.requestId.toLowerCase() || result.value.version !== intent.input.expectedVersion + (result.value.changed ? 1 : 0)) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      if (snapshot.request?.id === result.value.admissionRequestId && result.value.version >= snapshot.request.version) applyState({ ...snapshot, request: { ...snapshot.request, whatsappNumber: intent.input.whatsappNumber, version: result.value.version } });
      const message = result.value.changed ? ADMISSION_WHATSAPP_COPY.saved : ADMISSION_WHATSAPP_COPY.unchanged;
      writeToast.current?.announce({ kind: "success", message });
    } else if (snapshot.request?.id === result.value.admissionRequestId && result.value.version >= snapshot.request.version) {
      applyState({ ...snapshot, request: { ...snapshot.request, status: result.value.status, version: Math.max(snapshot.request.version, result.value.version) } });
      writeToast.current?.announce({ kind: "success", message: ADMISSION_UI_COPY.cancelled });
    }
    clearIntent(); setConfirmed(false); setCancelConfirmed(false); setWhatsappConfirmed(false); whatsappConfirmation.current = null;
    confirmOwnAction();
    if (await refresh(signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed) clearRefreshFailure();
    if (live(signal)) setPhase(ADMISSION_UI_PHASE.idle);
  }, [applyState, clearIntent, refresh, clearRefreshFailure, confirmOwnAction, setErrorMessage]);

  /** Reuses exactly the retained original body; changes to a draft cannot rewrite an ambiguous intent. */
  const write = useCallback(async (intent: AdmissionPendingIntent) => {
    if (busy.current || accountChanged) return;
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    captureActionFocus();
    busy.current = true; controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setErrorMessage(null); setFeedback(null); canRetryOriginal.current = false; setRetryOriginal(false);
    const notice = startWriteToast(intent.kind === "submit" ? ADMISSION_UI_COPY.submitting : intent.kind === ADMISSION_WHATSAPP_INTENT_KIND ? ADMISSION_WHATSAPP_COPY.saving : ADMISSION_UI_COPY.cancelling); writeToast.current = notice;
    try {
      if (!await checkViewer(request.signal)) return;
      if (!persist(intent)) return;
      pending.current = intent; setWritingWhatsapp(intent.kind === ADMISSION_WHATSAPP_INTENT_KIND); setPhase(ADMISSION_UI_PHASE.writing);
      const result = intent.kind === "submit" ? await client.submit(snapshot.overview.tribe.slug, { ...intent.input, ...(legacyInvitationToken ? { legacyInvitationToken } : {}) }, request.signal) : intent.kind === ADMISSION_WHATSAPP_INTENT_KIND ? await whatsappClient.updateWhatsappNumber(snapshot.overview.tribe.slug, intent.requestId, intent.input, request.signal) : await client.cancel(snapshot.overview.tribe.slug, intent.requestId, intent.input, request.signal);
      if (intent.kind === ADMISSION_WHATSAPP_INTENT_KIND && !await checkViewer(request.signal)) { if (live(request.signal)) setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      await completeWrite(intent, result, request.signal);
    } catch { if (live(request.signal)) { setErrorMessage(ADMISSION_UI_COPY.uncertain); setPhase(ADMISSION_UI_PHASE.uncertain); } }
    finally { if (writeToast.current === notice) writeToast.current = null; notice.finish(); if (controller.current === request) { busy.current = false; if (active.current) { setWritingWhatsapp(false); finishActionFocus(); } } }
  }, [accountChanged, checkViewer, client, whatsappClient, completeWrite, persist, legacyInvitationToken, setErrorMessage, captureActionFocus, finishActionFocus]);

  const read = useCallback(async (restored = false) => {
    if (busy.current && !restored) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request; busy.current = true;
    if (restored) { draftLoaded.current = false; setFormReady(false); }
    setErrorMessage(null); setFeedback(null); setPhase(ADMISSION_UI_PHASE.checking);
    try {
      if (restored || !draftLoaded.current) { if (!await checkViewer(request.signal)) return; restoreDraft(); }
      if (pending.current) await recover(request.signal); else { if (await refresh(request.signal) === NOTIFICATION_REFRESH_OUTCOME.refreshed) clearRefreshFailure(); if (live(request.signal)) setPhase(ADMISSION_UI_PHASE.idle); }
    }
    catch { if (live(request.signal)) { setErrorMessage(ADMISSION_UI_COPY.readFailed); if (!draftLoaded.current) setFormReady(false); } }
    finally { if (controller.current === request) { busy.current = false; if (live(request.signal)) setPhase((current) => current === ADMISSION_UI_PHASE.checking ? pending.current ? ADMISSION_UI_PHASE.uncertain : ADMISSION_UI_PHASE.idle : current); } }
  }, [recover, refresh, checkViewer, restoreDraft, clearRefreshFailure, setErrorMessage]);

  const contactState = state.kind === "ready" ? state : null, contactOptions = contactState?.overview.verification;
  const currentPending = contactState?.request?.status === "pending" && new Date(contactState.request.expiresAt) > new Date(now || contactState.renderedAt) ? contactState.request : null;
  // A server-authorized new common presentation has its own recovery lineage; prior originals remain readable.
  const previousRequestId = !requestPage && contactState?.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && contactState.request && !currentPending && contactState.request.status !== ADMISSION_REQUEST_STATUS.approved ? contactState.request.id : undefined;
  const showContact = Boolean(contactState?.viewerId && contactState.overview.policy?.requiresAdditionalVerification && contactOptions && (contactState.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired || currentPending?.needsVerification));
  const contact = useAdmissionContactVerification({ viewerId: contactState?.viewerId ?? null, slug: contactState?.overview.tribe.slug ?? "", requestId: currentPending?.id ?? null, requestVersion: currentPending?.version ?? null, previousRequestId, legacyInvitationToken, arrivalScope, policyVersion: contactState?.overview.policy?.version ?? 1, channel: contactOptions?.channel ?? MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: contactOptions?.allowedCountries ?? [], allowSmsAlternative: contactOptions?.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms, phone: draft.phone, country: draft.country, enabled: showContact && formReady && !accountChanged && phase !== ADMISSION_UI_PHASE.uncertain, renderedAt: contactState?.renderedAt ?? "", authorize: checkViewer, client: contactClient, onProof: () => {}, onApplied: (result) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.request || snapshot.request.id !== result.requestId || snapshot.request.version >= result.requestVersion) return;
    const appliedRequest: AdmissionRequestDto = { ...snapshot.request, version: result.requestVersion, needsVerification: false,
      ...(snapshot.request.contact ? { contact: { ...snapshot.request.contact, evidenceKind: ADMISSION_EVIDENCE_KIND.local } } : {}),
      eligibilityReasons: snapshot.request.eligibilityReasons.filter((reason) => reason !== ADMISSION_DENIAL_REASON.proofRequired && reason !== ADMISSION_DENIAL_REASON.evidenceRevoked) };
    applyState({ ...snapshot, request: appliedRequest, overview: { ...snapshot.overview, request: appliedRequest,
      safeMessage: getOwnAdmissionRequestMessage(appliedRequest) ?? ADMISSION_OVERVIEW_MESSAGE.pending } });
    // The incremental result confirms version/evidence; this own GET fills the newly attached masked contact without route refresh.
    void read();
  } });
  const contactBusy = contact.phase !== ADMISSION_CONTACT_PHASE.idle && contact.phase !== ADMISSION_CONTACT_PHASE.uncertain || contact.recoveryRequired && !contact.ready;
  const proofFresh = contact.proofFresh && !contact.recoveryRequired;
  const canSubmitWithProof = Boolean(!requestPage && contactState?.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && proofFresh && !contact.pending);

  useEffect(() => {
    active.current = true; const lifecycle = new AbortController(), initialization = new AbortController(); controller.current = initialization; busy.current = true;
    draftLoaded.current = false;
    const initialize = async () => {
      await Promise.resolve();
      if (!live(initialization.signal)) return;
      setFormReady(false); setPhase(ADMISSION_UI_PHASE.checking);
      try {
        if (!await checkViewer(initialization.signal)) return;
        const snapshot = currentState.current;
        if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
        restoreDraft();
        if (pending.current) { setPhase(ADMISSION_UI_PHASE.checking); await recover(initialization.signal); }
      } catch { if (live(initialization.signal)) { setErrorMessage(ADMISSION_UI_COPY.storageFailed); setFormReady(false); } }
      finally { if (controller.current === initialization && !initialization.signal.aborted) { busy.current = false; setPhase((current) => current === ADMISSION_UI_PHASE.checking ? pending.current ? ADMISSION_UI_PHASE.uncertain : ADMISSION_UI_PHASE.idle : current); } }
    };
    void initialize();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void read(true); };
    window.addEventListener("pageshow", onPageShow);
    const timer = setInterval(() => { if (!lifecycle.signal.aborted) setNow(new Date().toISOString()); }, ADMISSION_UI_CLOCK_INTERVAL_MS);
    // Activity preserves the draft, but native-viewer freshness must not survive its hidden interval.
    return () => { lifecycle.abort(); initialization.abort(); controller.current?.abort(); active.current = false; setFormReady(false); setWhatsappConfirmed(false); whatsappConfirmation.current = null; window.removeEventListener("pageshow", onPageShow); clearInterval(timer); };
  }, [checkViewer, recover, read, restoreDraft, setErrorMessage]);

  const changeDraft = (next: AdmissionDraft) => { if (busy.current || pending.current) return; const normalizedDraft = contact.challenge || contact.pending ? { ...next, phone: currentDraft.current.phone, country: currentDraft.current.country } : next; if (normalizedDraft.whatsappNumber !== currentDraft.current.whatsappNumber) { setWhatsappValidationError(null); setWhatsappEditError(null); setWhatsappConfirmed(false); whatsappConfirmation.current = null; } currentDraft.current = normalizedDraft; setDraft(normalizedDraft); setErrorMessage(null); setFeedback(null); persist(null); };
  const submit = () => {
    const snapshot = currentState.current;
    if (busy.current || pending.current || snapshot.kind !== "ready" || snapshot.overview.state !== ADMISSION_OVERVIEW_STATE.available && !canSubmitWithProof || !snapshot.overview.policy || !formReady || requestPage || contactBusy || contact.pending) return;
    if (!confirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    const phoneContact = snapshot.overview.policy.contactType === ADMISSION_CONTACT_TYPE.phone;
    /** With phone contact the contact phone is also the number compared with the group, so no separate number is asked or validated. */
    const whatsapp = phoneContact ? { valid: true as const, value: null } : validateBrowserAdmissionWhatsappNumberDraft(currentDraft.current.whatsappNumber, snapshot.overview.policy.requiresWhatsappNumber ?? false);
    if (!whatsapp.valid) { setWhatsappValidationError({ message: getAdmissionWhatsappNumberDraftMessage(whatsapp), policyVersion: snapshot.overview.policy.version }); return; }
    setWhatsappValidationError(null);
    const phone = snapshot.overview.policy.contactType === ADMISSION_CONTACT_TYPE.phone ? normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: currentDraft.current.phone, country: currentDraft.current.country }) : null;
    if (currentDraft.current.message.length > ADMISSION_LIMIT.internalMessageCharacters || phone && phone.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) { setErrorMessage(ADMISSION_UI_COPY.draftInvalid, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    if (snapshot.overview.policy.requiresAdditionalVerification && !proofFresh) { setErrorMessage(ADMISSION_UI_COPY.verifying, ADMISSION_FEEDBACK_ORIGIN.submit); return; }
    try { void write({ kind: "submit", input: { operationId: newAdmissionOperationId(), confirmed: true, expectedPolicyVersion: snapshot.overview.policy.version, ...(whatsapp.value ? { whatsappNumber: whatsapp.value } : {}), ...(snapshot.overview.policy.requiresAdditionalVerification && contact.proof ? { proofId: contact.proof.proofId } : {}), ...(phone?.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid && phone.contact.type === ADMISSION_CONTACT_TYPE.phone ? { phone: phone.contact.value, country: phone.contact.country } : {}), ...(currentDraft.current.message.trim() ? { message: currentDraft.current.message.trim() } : {}) } }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.submit); }
  };
  const cancel = () => {
    const snapshot = currentState.current;
    if (busy.current || pending.current || snapshot.kind !== "ready" || !snapshot.request || snapshot.request.status !== "pending" || !formReady) return;
    if (!cancelConfirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.cancel); return; }
    try { void write({ kind: "cancel", requestId: snapshot.request.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: snapshot.request.version } }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.cancel); }
  };
  /** Captures the rendered own version, never a silently advanced background snapshot. */
  const confirmWhatsapp = (value: boolean) => {
    if (busy.current || pending.current || !formReady || accountChanged || state.kind !== "ready" || !state.request) return;
    whatsappConfirmation.current = value ? { requestId: state.request.id, version: state.request.version, required: state.request.requiresWhatsappNumber ?? false } : null;
    setWhatsappConfirmed(value); setErrorMessage(null);
  };
  /** Validates the current rule before retaining an immutable correction alongside the existing recovery engine. */
  const saveWhatsapp = () => {
    const snapshot = currentState.current, observed = whatsappConfirmation.current;
    if (busy.current || pending.current || accountChanged || snapshot.kind !== "ready" || !snapshot.request || snapshot.request.status !== ADMISSION_REQUEST_STATUS.pending || new Date(snapshot.request.expiresAt).getTime() <= Date.now() || !formReady || contactBusy || contact.recoveryRequired) return;
    if (!whatsappConfirmed || !observed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired, ADMISSION_FEEDBACK_ORIGIN.whatsapp); return; }
    const required = snapshot.request.requiresWhatsappNumber ?? false;
    if (observed.requestId !== snapshot.request.id || observed.version !== snapshot.request.version || observed.required !== required) { setWhatsappConfirmed(false); whatsappConfirmation.current = null; setErrorMessage(ADMISSION_WHATSAPP_COPY.stale, ADMISSION_FEEDBACK_ORIGIN.whatsapp); return; }
    const value = validateBrowserAdmissionWhatsappNumberDraft(currentDraft.current.whatsappNumber ?? snapshot.request.whatsappNumber ?? undefined, required);
    if (!value.valid) { setWhatsappEditError({ requestId: snapshot.request.id, version: snapshot.request.version, required, message: getAdmissionWhatsappNumberDraftMessage(value) }); return; }
    setWhatsappEditError(null);
    try { void write({ kind: ADMISSION_WHATSAPP_INTENT_KIND, requestId: snapshot.request.id, input: { operationId: newAdmissionOperationId(), expectedVersion: observed.version, confirmed: true, whatsappNumber: value.value } }); }
    catch { setErrorMessage(ADMISSION_WHATSAPP_COPY.storageFailed, ADMISSION_FEEDBACK_ORIGIN.whatsapp); }
  };
  const returnPath = arrivalReturnPath ?? (state.kind === "ready" ? requestPage && state.request ? buildOwnAdmissionRequestRoute(state.overview.tribe.slug, state.request.id) : `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}` : state.returnPath ?? ROUTES.home);
  const signInHref = `${ROUTES.auth.signIn}?${new URLSearchParams({ callbackUrl: returnPath })}`;
  /** Signs out only when the overview asks for another account, then opens sign-in with this entry as its return path. */
  const changeAccount = async () => {
    if (busy.current || pending.current || accountChanged) return;
    busy.current = true; setChangingAccount(true); setErrorMessage(null);
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    try {
      const result = await accountClient.changeAccount(request.signal);
      if (!live(request.signal)) return;
      if (result.status === "ready") { replaceCurrentPageWithUrl(signInHref); return; }
      if (result.status === "failed") setErrorMessage(result.message);
    } finally { if (controller.current === request) { busy.current = false; if (active.current) setChangingAccount(false); } }
  };
  const retryHref = state.kind === "ready" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}` : undefined;
  const hasVerification = Boolean(showContact && contactOptions);
  // An unconfirmed code operation blocks the flow, so its read is the one next action; the delivery read stays collapsed.
  const contactRecovery = hasVerification && (contact.pending || contact.recoveryRequired) ? <><Button type="button" variant="secondary" disabled={contactBusy} onClick={() => void contact.readOriginal()}>Consultar operación del código</Button>{contact.canDiscardAbsent && <Button type="button" variant="ghost" disabled={contactBusy} onClick={() => void contact.discardAbsent()}>Descartar la referencia y pedir otro código</Button>}</> : undefined;
  const deliveryRead = hasVerification && contact.challenge?.deliveryId ? <Button type="button" variant="secondary" size="sm" disabled={contactBusy} onClick={() => void contact.readDelivery()}>Consultar envío del código</Button> : undefined;
  const flowMode = currentPending && hasVerification ? ADMISSION_REQUEST_FLOW_MODE.apply : ADMISSION_REQUEST_FLOW_MODE.submit;
  const flowSteps = admissionRequestFlowSteps(flowMode, hasVerification);
  // A landed code write opens the next step; resuming opens the first step still pending.
  const milestone: AdmissionRequestFlowStep | null = !hasVerification ? null : proofFresh ? "finish" : contact.challenge ? "verify" : null;
  const [seenMilestone, setSeenMilestone] = useState<string | null>(null);
  const milestoneKey = milestone ? `${flowMode}:${milestone}` : null;
  if (milestoneKey !== seenMilestone) { setSeenMilestone(milestoneKey); if (milestone) setStep(flowSteps.indexOf(milestone)); }
  const offersSubmission = contactState !== null && !requestPage && !currentPending && (contactState.overview.state === ADMISSION_OVERVIEW_STATE.available || contactState.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && hasVerification) && contactState.request?.status !== ADMISSION_REQUEST_STATUS.pending;
  // The data step checks the declared WhatsApp before moving on, so its message stays next to the field it explains.
  const whatsappDraft = contactState?.overview.policy && contactState.overview.policy.contactType !== ADMISSION_CONTACT_TYPE.phone ? validateBrowserAdmissionWhatsappNumberDraft(draft.whatsappNumber, contactState.overview.policy.requiresWhatsappNumber ?? false) : null;
  const detailsBlockedReason = whatsappDraft && !whatsappDraft.valid ? getAdmissionWhatsappNumberDraftMessage(whatsappDraft) : undefined;
  const flowBlocked = phase !== ADMISSION_UI_PHASE.idle || accountChanged || !formReady || contactBusy;
  const showsWhatsappEditor = Boolean(formReady && !accountChanged && currentPending && state.kind === "ready" && state.overview.policy?.contactType !== ADMISSION_CONTACT_TYPE.phone && (currentPending.requiresWhatsappNumber !== undefined || currentPending.whatsappNumber !== undefined));
  // Each error shows once, next to the step, action or field that produced it; when the page no longer offers that place, on the page itself.
  const errorAnchored = errorOrigin === ADMISSION_FEEDBACK_ORIGIN.submit ? offersSubmission && flowMode === ADMISSION_REQUEST_FLOW_MODE.submit
    : errorOrigin === ADMISSION_FEEDBACK_ORIGIN.cancel ? state.kind === "ready" && state.request !== null && !accountChanged
      : errorOrigin === ADMISSION_FEEDBACK_ORIGIN.whatsapp && showsWhatsappEditor;
  const placedErrorOrigin = errorAnchored ? errorOrigin : ADMISSION_FEEDBACK_ORIGIN.page;
  const errorAt = (origin: AdmissionFeedbackOrigin) => placedErrorOrigin === origin ? errorMessage : null;
  const requestFlow = contactState && (offersSubmission || flowMode === ADMISSION_REQUEST_FLOW_MODE.apply) ? <AdmissionRequestSteps mode={flowMode} step={step} onStepChange={setStep} busy={flowBlocked}
    issuing={contact.phase === ADMISSION_CONTACT_PHASE.issuing} verifying={contact.phase === ADMISSION_CONTACT_PHASE.verifying} verification={hasVerification && contactOptions ? { ready: contact.ready && !contact.recoveryRequired && formReady && !accountChanged, channel: contactOptions.channel, phone: draft.phone, country: draft.country, verificationCode: contact.code, confirmed: contact.confirmed, busy: contactBusy || phase === ADMISSION_UI_PHASE.writing || phase === ADMISSION_UI_PHASE.checking, canIssue: contact.ready && !contact.pending && !contact.challenge, canVerify: contact.ready && !contact.pending && !contact.proof, canResend: contact.ready && !contact.pending, canUseSmsAlternative: contactOptions.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms && contact.ready && !contact.pending, contactLocked: Boolean(contact.challenge || contact.pending), allowedCountries: contactOptions.allowedCountries, challenge: contact.challenge ? { ...contact.challenge, deliveryState: contact.delivery?.state ?? contact.challenge.deliveryState } : null, challengeUnavailable: contact.challengeUnavailable, requiresReplacement: contact.requiresReplacement, proofReady: proofFresh, proofExpired: Boolean(contact.proof && !proofFresh), expiresInSeconds: contact.expiresInSeconds, resendInSeconds: contact.resendInSeconds, errorMessage: contact.errorMessage ?? contact.challengeMessage ?? contact.deliveryMessage, feedback: contact.feedback, fieldErrors: contact.fieldErrors, onPhoneChange: (phone) => { if (!contact.pending && !contactBusy) { contact.clearFieldFeedback(); changeDraft({ ...draft, phone }); } }, onCountryChange: (country) => { if (!contact.pending && !contactBusy) { contact.clearFieldFeedback(); changeDraft({ ...draft, country }); } }, onCodeChange: contact.setCode, onConfirm: contact.setConfirmed, onIssue: () => void contact.issue(), onResend: () => void contact.resend(), onVerify: () => void contact.verify(), onUseSmsAlternative: () => void contact.useSmsAlternative() } : null} recovery={deliveryRead}
    form={{ draft, contactType: contactState.overview.policy?.contactType ?? "email", contactLocked: Boolean(contact.challenge || contact.pending), showWhatsappNumber: formReady && !accountChanged && contactState.overview.policy?.contactType !== ADMISSION_CONTACT_TYPE.phone, requiresWhatsappNumber: contactState.overview.policy?.requiresWhatsappNumber ?? false, whatsappErrorMessage: state.kind === "ready" && whatsappValidationError !== null && whatsappValidationError.policyVersion === state.overview.policy?.version ? whatsappValidationError.message : null, confirmed, disabled: flowBlocked, busy: phase === ADMISSION_UI_PHASE.writing, errorMessage: errorAt(ADMISSION_FEEDBACK_ORIGIN.submit), onChange: changeDraft, onConfirm: (value) => { setConfirmed(value); setErrorMessage(null); } }}
    finalAction={flowMode === ADMISSION_REQUEST_FLOW_MODE.apply
      ? { label: ADMISSION_REQUEST_FLOW_COPY.applyAction, loading: contact.phase === ADMISSION_CONTACT_PHASE.applying, disabled: !proofFresh || Boolean(contact.pending) || contactBusy && contact.phase !== ADMISSION_CONTACT_PHASE.applying, onRun: () => void contact.apply() }
      : { label: ADMISSION_UI_COPY.submit, loading: phase === ADMISSION_UI_PHASE.writing && !writingWhatsapp, disabled: !confirmed || flowBlocked && (phase !== ADMISSION_UI_PHASE.writing || writingWhatsapp) || hasVerification && !canSubmitWithProof && contactState.overview.state !== ADMISSION_OVERVIEW_STATE.available, onRun: submit }}
    detailsBlockedReason={detailsBlockedReason} finalBlockedReason={hasVerification && !proofFresh ? flowMode === ADMISSION_REQUEST_FLOW_MODE.apply ? ADMISSION_REQUEST_FLOW_COPY.applyProofRequired : ADMISSION_REQUEST_FLOW_COPY.proofRequired : undefined} /> : undefined;
  const whatsappErrorMessage = state.kind === "ready" && whatsappValidationError !== null && whatsappValidationError.policyVersion === state.overview.policy?.version ? whatsappValidationError.message : null;
  const currentWhatsappError = currentPending && whatsappEditError?.requestId === currentPending.id && whatsappEditError.version === currentPending.version && whatsappEditError.required === (currentPending.requiresWhatsappNumber ?? false) ? whatsappEditError.message : null;
  const whatsappEditor = showsWhatsappEditor && currentPending ? <AdmissionWhatsappNumberForm value={draft.whatsappNumber ?? currentPending.whatsappNumber ?? ""} currentNumber={currentPending.whatsappNumber ?? null} required={currentPending.requiresWhatsappNumber ?? false} confirmed={whatsappConfirmed} disabled={phase !== ADMISSION_UI_PHASE.idle || contactBusy || contact.recoveryRequired} busy={phase === ADMISSION_UI_PHASE.writing && writingWhatsapp} errorMessage={currentWhatsappError} actionErrorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.whatsapp)} onChange={(whatsappNumber) => changeDraft({ ...draft, whatsappNumber })} onConfirm={confirmWhatsapp} onSubmit={saveWhatsapp} /> : undefined;
  return <AdmissionScreen state={state} requestStatusRef={resultRef} requestPage={requestPage} requestFlow={requestFlow} contactRecovery={contactRecovery} whatsappEditor={whatsappEditor} changingAccount={changingAccount} onChangeAccount={() => void changeAccount()} canSubmitWithProof={canSubmitWithProof} contactLocked={Boolean(contact.challenge || contact.pending)} draft={draft} whatsappErrorMessage={whatsappErrorMessage} confirmed={confirmed} cancelConfirmed={cancelConfirmed} phase={phase} now={now} errorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.page) ?? (ownRequestRefreshUnavailable ? ADMISSION_UI_COPY.readFailed : null)} cancelErrorMessage={errorAt(ADMISSION_FEEDBACK_ORIGIN.cancel)} onRetryUnavailable={reloadCurrentPage} feedback={feedback} accountChanged={accountChanged} formReady={formReady && !contactBusy && !contact.recoveryRequired} retryOriginal={retryOriginal} signInHref={signInHref} retryHref={retryHref}
    onChange={changeDraft} onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }} onCancelConfirm={(value) => { setCancelConfirmed(value); setErrorMessage(null); }} onSubmit={submit} onCancel={cancel} onRead={() => void read()} onRetryOriginal={() => { if (canRetryOriginal.current && pending.current) void write(pending.current); }}
    onReloadAccount={() => { window.location.reload(); /* An actual authentication change requires a fresh server snapshot. */ }} />;
}
