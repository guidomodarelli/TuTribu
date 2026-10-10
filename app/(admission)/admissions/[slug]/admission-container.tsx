"use client";

/** Owns the single browser workflow, native viewer checks and durable local intent recovery. @module admission-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, toast } from "beez-ui";
import { ContactVerification } from "@/components/academy-admissions/contact-verification";
import { useAdmissionContactVerification } from "@/hooks/use-admission-contact-verification";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import { ADMISSION_CONTACT_PHASE, ADMISSION_CONTACT_COPY } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { AdmissionScreen } from "@/components/academy-admissions/admission-screen";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionRequestDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { readAdmissionDraft, writeAdmissionDraft, newAdmissionOperationId, type AdmissionDraft, type AdmissionPendingIntent } from "@/lib/academy-admissions/admission-draft";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { ADMISSION_UI_COPY, ADMISSION_UI_PHASE, ADMISSION_UI_CLOCK_INTERVAL_MS } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact";
import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ROUTES } from "@/src/constants/routes";

/** Do not replace a confirmed newer resource snapshot with a historical operation result. */
function retainCurrentRequest(current: AdmissionRequestDto | null, incoming: AdmissionRequestDto | null): AdmissionRequestDto | null {
  return current && incoming && current.id === incoming.id && current.version > incoming.version ? current : incoming;
}

/** @param props - Validated SSR snapshot, fixed own-detail mode and application transport port. @returns Presenters only; writes never trigger a route refresh. */
export function AdmissionContainer({ initialState, requestPage = false, client = admissionApiClient, contactClient }: { initialState: AdmissionPageState; requestPage?: boolean; client?: AdmissionBrowserClient; contactClient?: AdmissionContactBrowserClient }) {
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState<AdmissionDraft>({ phone: "", country: "", message: "" });
  const [confirmed, setConfirmed] = useState(false), [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [phase, setPhase] = useState<typeof ADMISSION_UI_PHASE[keyof typeof ADMISSION_UI_PHASE]>(ADMISSION_UI_PHASE.idle);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false), [accountChanged, setAccountChanged] = useState(false), [retryOriginal, setRetryOriginal] = useState(false);
  const [now, setNow] = useState(initialState.kind === "ready" ? initialState.renderedAt : "");
  const currentState = useRef(initialState), currentDraft = useRef(draft), pending = useRef<AdmissionPendingIntent | null>(null);
  const active = useRef(false), busy = useRef(false), canRetryOriginal = useRef(false), controller = useRef<AbortController | null>(null);
  const draftLoaded = useRef(false);
  const targetRequestId = requestPage && initialState.kind === "ready" ? initialState.request?.id : undefined;

  /** Publishes only the current container's snapshot. */
  const applyState = useCallback((next: AdmissionPageState) => { currentState.current = next; setState(next); }, []);
  const live = (signal: AbortSignal) => active.current && !signal.aborted;

  /** Saves the original body before dispatch; unavailable storage blocks a new write. */
  const persist = useCallback((intent: AdmissionPendingIntent | null) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return false;
    try { writeAdmissionDraft({ viewerId: snapshot.viewerId, slug: snapshot.overview.tribe.slug, draft: currentDraft.current, pending: intent }); return true; }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed); return false; }
  }, []);

  /** A stale or absent native viewer cannot inherit another account's draft or actions. */
  const checkViewer = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready") return false;
    const result = await client.viewer(signal);
    if (!active.current || signal.aborted) return false;
    if (result.status !== "ready") { if (result.status === "failed") setErrorMessage(ADMISSION_UI_COPY.readFailed); return false; }
    if ((result.value?.id ?? null) !== snapshot.viewerId) { setAccountChanged(true); setFormReady(false); setErrorMessage(ADMISSION_UI_COPY.accountChanged); return false; }
    setFormReady(draftLoaded.current || snapshot.viewerId === null);
    return true;
  }, [client]);

  /** Reads the current own projection after a confirmed result without substituting it into the original ledger response. */
  const refresh = useCallback(async (signal: AbortSignal) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !await checkViewer(signal)) return;
    const [overview, own] = await Promise.all([
      client.overview(snapshot.overview.tribe.slug, signal),
      snapshot.viewerId ? client.own(snapshot.overview.tribe.slug, targetRequestId, signal) : Promise.resolve({ status: "ready" as const, value: null }),
    ]);
    if (!active.current || signal.aborted || !await checkViewer(signal)) return;
    if (overview.status !== "ready" || own.status !== "ready" || overview.value.tribe.slug !== snapshot.overview.tribe.slug || targetRequestId && own.value?.id !== targetRequestId) { setErrorMessage(ADMISSION_UI_COPY.readFailed); return; }
    applyState({ ...snapshot, overview: overview.value, request: retainCurrentRequest(snapshot.request, own.value), renderedAt: new Date().toISOString() });
    setNow(new Date().toISOString());
  }, [client, checkViewer, applyState, targetRequestId]);

  /** Clears only a known final local intent; storage failures never turn that result into a new write. */
  const clearIntent = useCallback(() => { pending.current = null; canRetryOriginal.current = false; setRetryOriginal(false); persist(null); }, [persist]);

  /** A bfcache page must reload the original intent stored by a later document in this tab. */
  const restoreDraft = useCallback(() => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    const record = readAdmissionDraft(snapshot.viewerId, snapshot.overview.tribe.slug);
    if (record) { currentDraft.current = record.draft; setDraft(record.draft); pending.current = record.pending; }
    draftLoaded.current = true; setFormReady(true);
    setConfirmed(false); setCancelConfirmed(false); canRetryOriginal.current = false; setRetryOriginal(false);
  }, []);

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
    if (operation.operationId !== intent.input.operationId.toLowerCase() || operation.type !== (intent.kind === "submit" ? ADMISSION_OPERATION_TYPE.submit : ADMISSION_OPERATION_TYPE.cancel)) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (operation.state !== "completed") { setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if ("code" in operation.result) {
      const expectedRequestId = intent.kind === "cancel" ? intent.requestId.toLowerCase() : null;
      if (operation.result.admissionRequestId !== expectedRequestId) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
      clearIntent(); setFeedback(""); setErrorMessage(ADMISSION_ERROR_MESSAGE[operation.result.code]);
      await refresh(signal); if (active.current && !signal.aborted) setPhase(ADMISSION_UI_PHASE.idle);
      return;
    }
    if (operation.type === ADMISSION_OPERATION_TYPE.cancel && intent.kind === "cancel" && (operation.result.admissionRequestId !== intent.requestId || operation.result.status !== "cancelled")) { setErrorMessage(ADMISSION_UI_COPY.readFailed); setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    clearIntent(); setFeedback(operation.type === ADMISSION_OPERATION_TYPE.submit ? operation.result.outcome === ADMISSION_OUTCOME.pending ? ADMISSION_UI_COPY.outcomePending : ADMISSION_UI_COPY.outcomeMember : ADMISSION_UI_COPY.cancelled);
    await refresh(signal); if (active.current && !signal.aborted) setPhase(ADMISSION_UI_PHASE.idle);
  }, [client, checkViewer, clearIntent, refresh]);

  /** Applies minimal confirmed mutation data while the current projection is reconciled. */
  const completeWrite = useCallback(async (intent: AdmissionPendingIntent, result: Awaited<ReturnType<AdmissionBrowserClient["submit"]>> | Awaited<ReturnType<AdmissionBrowserClient["cancel"]>>, signal: AbortSignal) => {
    if (!live(signal)) return;
    if (result.status === "aborted") { setPhase(ADMISSION_UI_PHASE.uncertain); return; }
    if (result.status === "failed") {
      setErrorMessage(result.message);
      if (result.uncertain) setPhase(ADMISSION_UI_PHASE.uncertain);
      else { clearIntent(); setPhase(ADMISSION_UI_PHASE.idle); }
      toast.error(result.message); return;
    }
    if ("state" in result.value) { setPhase(ADMISSION_UI_PHASE.uncertain); toast.info(ADMISSION_UI_COPY.uncertain); return; }
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready") return;
    if ("outcome" in result.value) {
      const request = result.value.outcome === ADMISSION_OUTCOME.pending ? retainCurrentRequest(snapshot.request, result.value.request) : snapshot.request;
      applyState({ ...snapshot, request });
      setFeedback(result.value.safeMessage); toast.success(result.value.safeMessage);
    } else if (snapshot.request?.id === result.value.admissionRequestId && result.value.version >= snapshot.request.version) {
      applyState({ ...snapshot, request: { ...snapshot.request, status: result.value.status, version: Math.max(snapshot.request.version, result.value.version) } });
      setFeedback(ADMISSION_UI_COPY.cancelled); toast.success(ADMISSION_UI_COPY.cancelled);
    }
    clearIntent(); setConfirmed(false); setCancelConfirmed(false);
    await refresh(signal); if (live(signal)) setPhase(ADMISSION_UI_PHASE.idle);
  }, [applyState, clearIntent, refresh]);

  /** Reuses exactly the retained original body; changes to a draft cannot rewrite an ambiguous intent. */
  const write = useCallback(async (intent: AdmissionPendingIntent) => {
    if (busy.current || accountChanged) return;
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.viewerId) return;
    busy.current = true; controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setErrorMessage(null); setFeedback(null); canRetryOriginal.current = false; setRetryOriginal(false);
    const notice = toast.loading(intent.kind === "submit" ? ADMISSION_UI_COPY.submitting : ADMISSION_UI_COPY.cancelling);
    try {
      if (!await checkViewer(request.signal)) return;
      if (!persist(intent)) return;
      pending.current = intent; setPhase(ADMISSION_UI_PHASE.writing);
      const result = intent.kind === "submit" ? await client.submit(snapshot.overview.tribe.slug, intent.input, request.signal) : await client.cancel(snapshot.overview.tribe.slug, intent.requestId, intent.input, request.signal);
      await completeWrite(intent, result, request.signal);
    } catch { if (live(request.signal)) { setErrorMessage(ADMISSION_UI_COPY.uncertain); setPhase(ADMISSION_UI_PHASE.uncertain); } }
    finally { toast.dismiss(notice); if (controller.current === request) busy.current = false; }
  }, [accountChanged, checkViewer, client, completeWrite, persist]);

  const read = useCallback(async (restored = false) => {
    if (busy.current && !restored) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request; busy.current = true;
    if (restored) { draftLoaded.current = false; setFormReady(false); }
    setErrorMessage(null); setFeedback(null); setPhase(ADMISSION_UI_PHASE.checking);
    try {
      if (restored || !draftLoaded.current) { if (!await checkViewer(request.signal)) return; restoreDraft(); }
      if (pending.current) await recover(request.signal); else { await refresh(request.signal); if (live(request.signal)) setPhase(ADMISSION_UI_PHASE.idle); }
    }
    catch { if (live(request.signal)) { setErrorMessage(ADMISSION_UI_COPY.readFailed); if (!draftLoaded.current) setFormReady(false); } }
    finally { if (controller.current === request) { busy.current = false; if (live(request.signal)) setPhase((current) => current === ADMISSION_UI_PHASE.checking ? pending.current ? ADMISSION_UI_PHASE.uncertain : ADMISSION_UI_PHASE.idle : current); } }
  }, [recover, refresh, checkViewer, restoreDraft]);

  const contactState = state.kind === "ready" ? state : null, contactOptions = contactState?.overview.verification;
  const currentPending = contactState?.request?.status === "pending" && new Date(contactState.request.expiresAt) > new Date(now || contactState.renderedAt) ? contactState.request : null;
  const showContact = Boolean(contactState?.viewerId && contactState.overview.policy?.requiresAdditionalVerification && contactOptions && (contactState.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired || currentPending?.needsVerification));
  const contact = useAdmissionContactVerification({ viewerId: contactState?.viewerId ?? null, slug: contactState?.overview.tribe.slug ?? "", requestId: currentPending?.id ?? null, requestVersion: currentPending?.version ?? null, policyVersion: contactState?.overview.policy?.version ?? 1, channel: contactOptions?.channel ?? MESSAGING_PUBLIC_CHANNEL.email, allowedCountries: contactOptions?.allowedCountries ?? [], allowSmsAlternative: contactOptions?.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms, phone: draft.phone, country: draft.country, enabled: showContact && formReady && !accountChanged && phase !== ADMISSION_UI_PHASE.uncertain, renderedAt: contactState?.renderedAt ?? "", authorize: checkViewer, client: contactClient, onProof: () => {}, onApplied: (result) => {
    const snapshot = currentState.current;
    if (snapshot.kind !== "ready" || !snapshot.request || snapshot.request.id !== result.requestId || snapshot.request.version > result.requestVersion) return;
    applyState({ ...snapshot, request: { ...snapshot.request, version: result.requestVersion, needsVerification: false } });
    // The incremental result confirms version/evidence; this own GET fills the newly attached masked contact without route refresh.
    const viewerId = snapshot.viewerId;
    void read().then(() => { const current = currentState.current; if (active.current && current.kind === "ready" && current.viewerId === viewerId && current.request?.id === result.requestId) setFeedback(ADMISSION_CONTACT_COPY.applied); });
  } });
  const contactBusy = contact.phase !== ADMISSION_CONTACT_PHASE.idle && contact.phase !== ADMISSION_CONTACT_PHASE.uncertain;
  const proofFresh = contact.proofFresh;
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
    return () => { lifecycle.abort(); initialization.abort(); controller.current?.abort(); active.current = false; window.removeEventListener("pageshow", onPageShow); clearInterval(timer); };
  }, [checkViewer, recover, read, restoreDraft]);

  const changeDraft = (next: AdmissionDraft) => { if (busy.current || pending.current) return; const normalizedDraft = contact.challenge || contact.pending ? { ...next, phone: currentDraft.current.phone, country: currentDraft.current.country } : next; currentDraft.current = normalizedDraft; setDraft(normalizedDraft); setErrorMessage(null); setFeedback(null); persist(null); };
  const submit = () => {
    const snapshot = currentState.current;
    if (busy.current || pending.current || snapshot.kind !== "ready" || snapshot.overview.state !== ADMISSION_OVERVIEW_STATE.available && !canSubmitWithProof || !snapshot.overview.policy || !formReady || requestPage || contactBusy || contact.pending) return;
    if (!confirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired); return; }
    const phone = snapshot.overview.policy.contactType === ADMISSION_CONTACT_TYPE.phone ? normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value: currentDraft.current.phone, country: currentDraft.current.country }) : null;
    if (currentDraft.current.message.length > ADMISSION_LIMIT.internalMessageCharacters || phone && phone.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) { setErrorMessage(ADMISSION_UI_COPY.draftInvalid); return; }
    if (snapshot.overview.policy.requiresAdditionalVerification && !proofFresh) { setErrorMessage(ADMISSION_UI_COPY.verifying); return; }
    try { void write({ kind: "submit", input: { operationId: newAdmissionOperationId(), confirmed: true, expectedPolicyVersion: snapshot.overview.policy.version, ...(snapshot.overview.policy.requiresAdditionalVerification && contact.proof ? { proofId: contact.proof.proofId } : {}), ...(phone?.status === ADMISSION_CONTACT_NORMALIZATION_STATUS.valid && phone.contact.type === ADMISSION_CONTACT_TYPE.phone ? { phone: phone.contact.value, country: phone.contact.country } : {}), ...(currentDraft.current.message.trim() ? { message: currentDraft.current.message.trim() } : {}) } }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed); }
  };
  const cancel = () => {
    const snapshot = currentState.current;
    if (busy.current || pending.current || snapshot.kind !== "ready" || !snapshot.request || snapshot.request.status !== "pending" || !formReady) return;
    if (!cancelConfirmed) { setErrorMessage(ADMISSION_UI_COPY.confirmationRequired); return; }
    try { void write({ kind: "cancel", requestId: snapshot.request.id, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: snapshot.request.version } }); }
    catch { setErrorMessage(ADMISSION_UI_COPY.storageFailed); }
  };
  const returnPath = state.kind === "ready" ? requestPage && state.request ? buildOwnAdmissionRequestRoute(state.overview.tribe.slug, state.request.id) : `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}` : state.returnPath ?? ROUTES.home;
  const signInHref = `${ROUTES.auth.signIn}?${new URLSearchParams({ callbackUrl: returnPath })}`;
  const retryHref = state.kind === "ready" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(state.overview.tribe.slug)}` : undefined;
  const verification = showContact && contactOptions ? <>
    <ContactVerification ready={contact.ready && formReady && !accountChanged} channel={contactOptions.channel} phone={draft.phone} country={draft.country} verificationCode={contact.code} confirmed={contact.confirmed} busy={contactBusy || phase === ADMISSION_UI_PHASE.writing || phase === ADMISSION_UI_PHASE.checking} canIssue={contact.ready && !contact.pending && !contact.challenge} canVerify={contact.ready && !contact.pending && !contact.proof} canResend={contact.ready && !contact.pending} canUseSmsAlternative={contactOptions.allowedAlternative === MESSAGING_PUBLIC_CHANNEL.sms && contact.ready && !contact.pending} contactLocked={Boolean(contact.challenge || contact.pending)} allowedCountries={contactOptions.allowedCountries} challenge={contact.challenge ? { ...contact.challenge, deliveryState: contact.delivery?.state ?? contact.challenge.deliveryState } : null} proofReady={proofFresh} proofExpired={Boolean(contact.proof && !proofFresh)} expiresInSeconds={contact.expiresInSeconds} resendInSeconds={contact.resendInSeconds} errorMessage={contact.errorMessage ?? contact.deliveryMessage} feedback={contact.feedback} fieldErrors={contact.fieldErrors} onPhoneChange={(phone) => { if (!contact.pending && !contactBusy) { contact.clearFieldFeedback(); changeDraft({ ...draft, phone }); } }} onCountryChange={(country) => { if (!contact.pending && !contactBusy) { contact.clearFieldFeedback(); changeDraft({ ...draft, country }); } }} onCodeChange={contact.setCode} onConfirm={contact.setConfirmed} onIssue={() => void contact.issue()} onResend={() => void contact.resend()} onVerify={() => void contact.verify()} onUseSmsAlternative={() => void contact.useSmsAlternative()} />
    {contact.pending && <Button type="button" variant="outline" disabled={contactBusy} onClick={() => void contact.readOriginal()}>Consultar operación del código</Button>}
    {contact.challenge?.deliveryId && <Button type="button" variant="outline" disabled={contactBusy} onClick={() => void contact.readDelivery()}>Consultar envío del código</Button>}
    {currentPending && proofFresh && <Button type="button" disabled={contactBusy || Boolean(contact.pending)} onClick={() => void contact.apply()}>Aplicar prueba a esta solicitud</Button>}
  </> : undefined;
  return <AdmissionScreen state={state} requestPage={requestPage} verification={verification} canSubmitWithProof={canSubmitWithProof} contactLocked={Boolean(contact.challenge || contact.pending)} draft={draft} confirmed={confirmed} cancelConfirmed={cancelConfirmed} phase={phase} now={now} errorMessage={errorMessage} feedback={feedback} accountChanged={accountChanged} formReady={formReady && !contactBusy} retryOriginal={retryOriginal} signInHref={signInHref} retryHref={retryHref}
    onChange={changeDraft} onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }} onCancelConfirm={(value) => { setCancelConfirmed(value); setErrorMessage(null); }} onSubmit={submit} onCancel={cancel} onRead={() => void read()} onRetryOriginal={() => { if (canRetryOriginal.current && pending.current) void write(pending.current); }}
    onReloadAccount={() => { window.location.reload(); /* An actual authentication change requires a fresh server snapshot. */ }} />;
}
