"use client";
/** Owns account-bound personal confirmation and original reference recovery without automatic writes. @module use-personal-invitation */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import type { AdmissionBrowserSubmission } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { personalInvitationApiClient } from "@/lib/academy-admissions/personal-invitation-api-client";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";
import { readPersonalInvitationSubmissionIntent, writePersonalInvitationSubmissionIntent, clearPersonalInvitationSubmissionIntent, assertPersonalInvitationSubmissionStorage, type PersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { PERSONAL_INVITATION_UI_PHASE, PERSONAL_INVITATION_UI_COPY, PERSONAL_INVITATION_UI_TIMEOUT_MS } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/personal-invitation-overview";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";

type PersonalPhase = "idle" | "reading" | "submitting" | "changing_account" | "uncertain";

/** @param options - Safe SSR snapshot, route token and own application transport. @returns Controlled state and explicit actions; opening, recovery and timers never submit. */
export function usePersonalInvitation(options: { initialState: PersonalInvitationPageState; token: string; client?: PersonalInvitationBrowserClient }) {
  const client = options.client ?? personalInvitationApiClient;
  const [state, setState] = useState(options.initialState), [phase, setPhase] = useState<PersonalPhase>(PERSONAL_INVITATION_UI_PHASE.idle);
  const [ready, setReady] = useState(false), [personalScope, setPersonalScope] = useState<string | null>(null), [confirmed, setConfirmed] = useState(false), [accountChanged, setAccountChanged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null), [hasPending, setHasPending] = useState(false);
  const current = useRef(state), scope = useRef<string | null>(null), pending = useRef<PersonalInvitationSubmissionIntent | null>(null), active = useRef(false), busy = useRef(false), accountClosed = useRef(false), controller = useRef<AbortController | null>(null);
  const live = (signal: AbortSignal) => active.current && !signal.aborted;
  const publish = useCallback((next: PersonalInvitationPageState) => { current.current = next; setState(next); }, []);

  /** Publishes only an owned confirmed outcome before a follow-up read can fail; no fresh request dates or versions are invented. */
  const applyOutcome = useCallback((outcome: "pending" | "admitted" | "already_member", request?: AdmissionRequestDto) => {
    const snapshot = current.current;
    if (snapshot.kind !== "ready" || snapshot.preview.state !== PERSONAL_INVITATION_OVERVIEW_STATE.available) return;
    const overview = snapshot.preview.overview, { request: _previousRequest, ...summary } = overview;
    publish({ ...snapshot, preview: { ...snapshot.preview, overview: { ...summary, state: outcome === ADMISSION_OUTCOME.pending ? ADMISSION_OVERVIEW_STATE.pending : ADMISSION_OVERVIEW_STATE.alreadyMember, nextAction: outcome === ADMISSION_OUTCOME.pending ? ADMISSION_NEXT_ACTION.viewRequest : ADMISSION_NEXT_ACTION.openAcademy, safeMessage: outcome === ADMISSION_OUTCOME.pending ? PERSONAL_INVITATION_UI_COPY.pending : PERSONAL_INVITATION_UI_COPY.admitted, ...(request ? { request } : {}) } } });
  }, [publish]);

  /** Reconciles references written by another document in this tab before any new canje or bfcache observation. */
  const restoreReference = useCallback(() => {
    const snapshot = current.current, digest = scope.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId || snapshot.preview.state !== PERSONAL_INVITATION_OVERVIEW_STATE.available || !digest) return;
    pending.current = readPersonalInvitationSubmissionIntent({ viewerId: snapshot.viewerId, slug: snapshot.preview.overview.tribe.slug, personalScope: digest }); setHasPending(Boolean(pending.current));
  }, []);

  /** Checks one native account before and after every async result; no session or provider DTO reaches presentation. */
  const authorize = useCallback(async (signal: AbortSignal) => {
    const snapshot = current.current;
    if (snapshot.kind !== "ready" || accountClosed.current) return false;
    const viewer = await client.viewer(signal);
    if (!active.current || signal.aborted) return false;
    if (viewer.status !== "ready") { if (viewer.status === "failed") setErrorMessage(viewer.message); return false; }
    if ((viewer.value?.id ?? null) !== snapshot.viewerId) { accountClosed.current = true; setAccountChanged(true); setReady(false); setConfirmed(false); setErrorMessage(PERSONAL_INVITATION_UI_COPY.accountChanged); return false; }
    return true;
  }, [client]);

  /** Reads only the current proposal; a refreshed generic view cannot retain another account's academy hints. */
  const refresh = useCallback(async (signal: AbortSignal, proofId?: string) => {
    const snapshot = current.current;
    if (snapshot.kind !== "ready" || !await authorize(signal) || !live(signal)) return false;
    const preview = await client.overview(options.token, proofId, signal);
    if (!live(signal) || !await authorize(signal) || !live(signal)) return false;
    if (preview.status !== "ready") { if (preview.status === "failed") setErrorMessage(preview.message); return false; }
    if (preview.value.viewerId !== snapshot.viewerId) { accountClosed.current = true; setAccountChanged(true); setReady(false); setConfirmed(false); setErrorMessage(PERSONAL_INVITATION_UI_COPY.accountChanged); return false; }
    if (snapshot.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available && preview.value.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available && preview.value.preview.overview.tribe.slug !== snapshot.preview.overview.tribe.slug) { setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    publish({ ...snapshot, preview: preview.value.preview, renderedAt: new Date().toISOString() });
    return true;
  }, [authorize, client, options.token, publish]);

  /** Clears a terminal reference only after an actual owned result; storage errors keep new writes closed. */
  const clear = useCallback(() => {
    const intent = pending.current;
    if (!intent) return true;
    try { clearPersonalInvitationSubmissionIntent(intent); pending.current = null; setHasPending(false); return true; }
    catch { setReady(false); setErrorMessage(PERSONAL_INVITATION_UI_COPY.storage); return false; }
  }, []);

  /** Reads exactly the original namespace/id without a new POST or an invented accepted result. */
  const recover = useCallback(async (signal: AbortSignal) => {
    const intent = pending.current;
    if (!intent || !await authorize(signal) || !live(signal)) return false;
    const result = await client.operation(intent.slug, intent.operationId, signal);
    if (!live(signal) || !await authorize(signal) || !live(signal)) return false;
    if (result.status !== "ready") { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(result.status === "failed" && result.code === ADMISSION_ERROR_CODE.resourceUnavailable ? PERSONAL_INVITATION_UI_COPY.absent : PERSONAL_INVITATION_UI_COPY.uncertain); return false; }
    const parsed = admissionOperationRecoverySchema.safeParse(result.value);
    if (!parsed.success || parsed.data.type !== ADMISSION_OPERATION_TYPE.submit || parsed.data.operationId.toLowerCase() !== intent.operationId.toLowerCase()) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    if (parsed.data.state === OPERATION_STATE.started) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); return true; }
    const original = parsed.data.result;
    if (original.outcome !== ADMISSION_OUTCOME.denied && original.operationId.toLowerCase() !== intent.operationId.toLowerCase() || original.outcome === ADMISSION_OUTCOME.denied && original.admissionRequestId !== null) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return false; }
    if (!clear()) return false;
    if (original.outcome !== ADMISSION_OUTCOME.denied) { applyOutcome(original.outcome, original.requestSnapshot); setFeedback(original.outcome === ADMISSION_OUTCOME.pending ? PERSONAL_INVITATION_UI_COPY.pending : PERSONAL_INVITATION_UI_COPY.admitted); }
    else setErrorMessage(ADMISSION_ERROR_MESSAGE[original.code]);
    await refresh(signal);
    if (live(signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    return live(signal);
  }, [applyOutcome, authorize, clear, client, refresh]);

  /** Serializes observations with the same deadline/cancellation owner as explicit mutation actions. */
  const observe = useCallback(async (proofId?: string) => {
    if (busy.current || !active.current) return;
    const request = new AbortController(); controller.current = request; busy.current = true;
    setPhase(PERSONAL_INVITATION_UI_PHASE.reading); setConfirmed(false); setErrorMessage(null); setFeedback(null);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try {
      restoreReference();
      const observed = pending.current ? await recover(request.signal) : await refresh(request.signal, proofId);
      if (!observed || !live(request.signal)) return;
      const currentSnapshot = current.current, currentDigest = scope.current;
      if (currentSnapshot.kind === "ready" && currentSnapshot.viewerId && currentSnapshot.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available && currentDigest) assertPersonalInvitationSubmissionStorage({ viewerId: currentSnapshot.viewerId, slug: currentSnapshot.preview.overview.tribe.slug, personalScope: currentDigest });
      if (await authorize(request.signal) && live(request.signal)) setReady(true);
      if (!pending.current && live(request.signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
    }
    catch { if (live(request.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); }
    finally { window.clearTimeout(deadline); if (controller.current === request) { controller.current = null; busy.current = false; if (active.current) { setPhase((currentPhase) => currentPhase === PERSONAL_INVITATION_UI_PHASE.reading ? pending.current ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle : currentPhase); if (request.signal.aborted) setErrorMessage(pending.current ? PERSONAL_INVITATION_UI_COPY.uncertain : ADMISSION_ERROR_MESSAGE.dependency_unavailable); } } }
  }, [authorize, recover, refresh, restoreReference]);

  useEffect(() => {
    active.current = true;
    const initialization = new AbortController(); controller.current = initialization; busy.current = true;
    const deadline = window.setTimeout(() => initialization.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    const initialize = async () => {
      try {
        const digest = await createPersonalInvitationBrowserScope(options.token);
        if (!live(initialization.signal)) return;
        scope.current = digest; setPersonalScope(digest);
        const snapshot = current.current;
        if (snapshot.kind !== "ready" || !await authorize(initialization.signal) || !live(initialization.signal)) return;
        if (snapshot.viewerId && snapshot.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available) {
          restoreReference();
          if (pending.current) { setPhase(PERSONAL_INVITATION_UI_PHASE.reading); await recover(initialization.signal); }
        }
        if (live(initialization.signal)) setReady(true);
      } catch { if (live(initialization.signal)) setErrorMessage(PERSONAL_INVITATION_UI_COPY.storage); }
      finally { window.clearTimeout(deadline); if (controller.current === initialization) { busy.current = false; controller.current = null; if (active.current && initialization.signal.aborted) { setPhase(pending.current ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); } } }
    };
    void initialize();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { setConfirmed(false); void observe(); } };
    window.addEventListener("pageshow", onPageShow);
    return () => { active.current = false; initialization.abort(); controller.current?.abort(); controller.current = null; busy.current = false; window.clearTimeout(deadline); window.removeEventListener("pageshow", onPageShow); };
  }, [authorize, observe, options.token, recover, restoreReference]);

  /** Saves original metadata before dispatch; uncertain/aborted results cannot enable another canje. */
  const submit = useCallback(async (input: Omit<AdmissionBrowserSubmission, "operationId" | "confirmed" | "invitationToken">) => {
    const snapshot = current.current, digest = scope.current;
    if (!ready || busy.current || pending.current || !digest || snapshot.kind !== "ready" || !snapshot.viewerId || snapshot.preview.state !== PERSONAL_INVITATION_OVERVIEW_STATE.available) return;
    if (!confirmed) { setErrorMessage(PERSONAL_INVITATION_UI_COPY.confirmationRequired); return; }
    const overview = snapshot.preview.overview;
    if (!overview.policy || overview.policy.version !== input.expectedPolicyVersion || overview.state === ADMISSION_OVERVIEW_STATE.pending || overview.state === ADMISSION_OVERVIEW_STATE.alreadyMember) { setErrorMessage(ADMISSION_ERROR_MESSAGE.policy_conflict); return; }
    if (overview.policy.requiresAdditionalVerification && !input.proofId) { setErrorMessage(PERSONAL_INVITATION_UI_COPY.verification); return; }
    const request = new AbortController(); controller.current = request; busy.current = true; setPhase(PERSONAL_INVITATION_UI_PHASE.submitting); setErrorMessage(null); setFeedback(null);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try {
      if (!await authorize(request.signal) || !live(request.signal)) return;
      restoreReference();
      if (pending.current) { setConfirmed(false); setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); return; }
      const operationId = newAdmissionOperationId(), intent = { viewerId: snapshot.viewerId, slug: snapshot.preview.overview.tribe.slug, personalScope: digest, operationId };
      writePersonalInvitationSubmissionIntent(intent); pending.current = intent; setHasPending(true);
      const result = await client.submit(intent.slug, { ...input, operationId, confirmed: true, invitationToken: options.token }, request.signal);
      if (!live(request.signal) || !await authorize(request.signal) || !live(request.signal)) return;
      if (result.status === "ready" && result.value.operationId.toLowerCase() !== operationId.toLowerCase()) { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(ADMISSION_ERROR_MESSAGE.public_contract_unusable); return; }
      if (result.status === "ready" && !("state" in result.value)) {
        if (!clear()) return;
        applyOutcome(result.value.outcome, result.value.outcome === ADMISSION_OUTCOME.pending ? result.value.request : undefined);
        setConfirmed(false); setFeedback(result.value.safeMessage); toast.success(result.value.safeMessage);
        await refresh(request.signal); if (live(request.signal)) setPhase(PERSONAL_INVITATION_UI_PHASE.idle);
      } else if (result.status === "failed" && !result.uncertain) { if (!clear()) return; setErrorMessage(result.message); setPhase(PERSONAL_INVITATION_UI_PHASE.idle); }
      else { setPhase(PERSONAL_INVITATION_UI_PHASE.uncertain); setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); }
    } catch { if (live(request.signal)) { setErrorMessage(pending.current ? PERSONAL_INVITATION_UI_COPY.uncertain : PERSONAL_INVITATION_UI_COPY.storage); setPhase(pending.current ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle); } }
    finally { window.clearTimeout(deadline); if (controller.current === request) { busy.current = false; controller.current = null; if (active.current) { setPhase((currentPhase) => currentPhase === PERSONAL_INVITATION_UI_PHASE.submitting ? pending.current ? PERSONAL_INVITATION_UI_PHASE.uncertain : PERSONAL_INVITATION_UI_PHASE.idle : currentPhase); if (request.signal.aborted) setErrorMessage(PERSONAL_INVITATION_UI_COPY.uncertain); } } }
  }, [applyOutcome, authorize, clear, client, confirmed, options.token, ready, refresh, restoreReference]);

  /** Changes global account only after an explicit click; the caller navigates to a preserved internal return. */
  const changeAccount = useCallback(async () => {
    if (busy.current || !active.current) return false;
    const request = new AbortController(); controller.current = request; busy.current = true; setPhase(PERSONAL_INVITATION_UI_PHASE.changingAccount); setErrorMessage(null); setConfirmed(false);
    const deadline = window.setTimeout(() => request.abort(), PERSONAL_INVITATION_UI_TIMEOUT_MS);
    try {
      const result = await client.changeAccount(request.signal);
      if (!live(request.signal)) return false;
      if (result.status === "ready") { setReady(false); return true; }
      setErrorMessage(result.status === "failed" ? result.message : ADMISSION_ERROR_MESSAGE.dependency_unavailable); return false;
    } catch { if (live(request.signal)) setErrorMessage(ADMISSION_ERROR_MESSAGE.dependency_unavailable); return false; }
    finally { window.clearTimeout(deadline); if (controller.current === request) { busy.current = false; controller.current = null; if (active.current) setPhase(PERSONAL_INVITATION_UI_PHASE.idle); } }
  }, [client]);
  const changeConfirmation = useCallback((value: boolean) => { setConfirmed(value); setErrorMessage(null); setFeedback(null); }, []);
  return { state, ready, personalScope, confirmed, setConfirmed: changeConfirmation, accountChanged, phase, errorMessage, feedback, hasPending, authorize, read: observe, submit, changeAccount };
}
