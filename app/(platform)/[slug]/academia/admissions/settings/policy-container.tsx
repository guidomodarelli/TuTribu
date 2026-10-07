"use client";
/** Owns current viewer checks and original policy reconciliation; the presenter has no transport. @module admission-policy-container */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyMutationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import { createAdmissionPolicyDraft, validateAdmissionPolicyBrowserDraft, admissionPolicyBrowserIntentSchema, admissionPolicyDraftSchema, type AdmissionPolicyBrowserIntent } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import { AdmissionPolicyForm } from "@/components/academy-admissions/admission-policy-form";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_POLICY_BROWSER_PHASE as PHASE, ADMISSION_POLICY_BROWSER_COPY as COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_OPERATION, ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_CONFIGURATION_ERROR, ADMISSION_POLICY_EDITABLE_FIELDS } from "@/src/modules/academy-admissions/constants/admission-policy";
import { admissionPolicyStateResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionPolicyReauthenticationClient, AdmissionPolicyReauthenticationOperation } from "@/src/modules/academy-admissions/application/ports/admission-policy-reauthentication-client";
import { admissionPolicyReauthenticationClient } from "@/lib/academy-admissions/admission-policy-reauthentication-client";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";

/** Only application props and own ports enter the workflow; no SDK identity is serialized. */
type PolicyContainerProps = { initialState: AdmissionPolicyPageState; client?: AdmissionPolicyBrowserClient; reauthentication?: AdmissionPolicyReauthenticationClient };
/** @param props - Safe SSR state and an optional own transport port. @returns A current account-scoped form that retains draft/UUID through conflict and uncertainty. */
export function AdmissionPolicyContainer({ initialState, client = admissionApiClient, reauthentication = admissionPolicyReauthenticationClient }: PolicyContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const [state, setState] = useState(ready?.policy ?? null);
  const [draft, setDraft] = useState<AdmissionPolicyDraft | null>(ready ? createAdmissionPolicyDraft(ready.policy) : null);
  const [phase, setPhase] = useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking);
  const [confirmed, setConfirmed] = useState(false), [pauseReason, setPauseReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preflightMessage, setPreflightMessage] = useState<string | null>(null), [activationAvailable, setActivationAvailable] = useState(false);
  const [fresh, setFresh] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [reauthenticationOperation, setReauthenticationOperation] = useState<AdmissionPolicyReauthenticationOperation | null>(null), [reauthenticationHref, setReauthenticationHref] = useState<string | null>(null);
  const pending = useRef<AdmissionPolicyBrowserIntent | null>(null), loaded = useRef(false), busy = useRef(false);
  const mounted = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  const draftChanged = Boolean(state?.policy && draft && ADMISSION_POLICY_EDITABLE_FIELDS.some((field) => draft[field] !== state.policy![field]));

  /** Checks the native account before reading a local intention or accepting a private response. */
  const checkViewer = useCallback(async (signal: AbortSignal) => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { setFresh(false); setPrivateVisible(false); setErrorMessage(viewer.message); return false; }
    if (viewer.value?.id !== ready.viewerId) { setFresh(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client]);

  /** Retrieves original identity first; historical results never replace today's configuration. */
  const readCurrent = useCallback(async (signal: AbortSignal, restore = false) => {
    if (!ready || signal.aborted) return;
    setPhase(PHASE.reading); setFresh(false); setConfirmed(false); setCanRetry(false); setActivationAvailable(false);
    let recovered = false;
    try {
      if (!await checkViewer(signal)) return;
      if (!loaded.current) {
        pending.current = readAdmissionPolicyIntent(ready.viewerId, ready.slug); loaded.current = true;
        if (pending.current?.type === ADMISSION_POLICY_OPERATION.update) {
          const { operationId: _operationId, confirmed: _confirmed, expectedVersion: _expectedVersion, ...restoredDraft } = pending.current.input;
          setDraft(admissionPolicyDraftSchema.parse(restoredDraft));
        }
      }
      if (pending.current) {
        const intent = pending.current, recovery = await client.operation(ready.slug, intent.input.operationId, signal);
        if (signal.aborted || recovery.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (recovery.status === "ready") {
          if (recovery.value.operationId !== intent.input.operationId || recovery.value.type !== intent.type || recovery.value.state !== "completed" || !("policyId" in recovery.value.result) || recovery.value.result.policyId !== ready.tribeId) { setErrorMessage(COPY.uncertain); return; }
          if (!await checkViewer(signal)) return;
          writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); pending.current = null; recovered = true; setStatusMessage(COPY.recovered);
        } else if (recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) { setCanRetry(true); setErrorMessage(COPY.retry); }
        else { setErrorMessage(recovery.message); return; }
      }
      if (!restore || pending.current || recovered) {
        const current = await client.readPolicy(ready.slug, signal);
        if (signal.aborted || current.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (current.status === "failed") { setErrorMessage(current.message); return; }
        setState(current.value);
      }
      setFresh(true); setPrivateVisible(true);
    } catch { if (!signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally { if (!signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer]);

  /** Explicit reads use one cancellable slot and cannot replace an in-flight write. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setErrorMessage(null); setConfirmed(false); void readCurrent(controller.signal);
  }, [readCurrent]);

  useEffect(() => {
    const controller = new AbortController(); readController.current = controller;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { setPrivateVisible(false); setFresh(false); setConfirmed(false); }
      return readCurrent(controller.signal, initial);
    });
    /** Activity/bfcache restoration must reload the original intention before any new write. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setPrivateVisible(false); setFresh(false); setConfirmed(false); writeController.current?.abort(); busy.current = false; loaded.current = false; launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /** Applies only a new confirmed minimal response at the observed current version. */
  const applyResult = (intent: AdmissionPolicyBrowserIntent, result: AdmissionPolicyMutationResult) => {
    if (!ready || !state || result.policyId !== ready.tribeId) throw new Error("Policy result owner mismatch");
    if (intent.type !== ADMISSION_POLICY_OPERATION.initialize && (!state.policy || state.policy.version !== intent.input.expectedVersion || result.version !== intent.input.expectedVersion + (result.changed ? 1 : 0))) throw new Error("Policy result counter mismatch");
    const changes = intent.type === ADMISSION_POLICY_OPERATION.update ? intent.input : intent.type === ADMISSION_POLICY_OPERATION.pause ? { isOpen: false } : {};
    const currentDraft = state.policy ? createAdmissionPolicyDraft(state) : draft!;
    const policy = { ...(state.policy ?? { ...currentDraft, id: result.policyId, usage: state.usage, requirements: [] }), ...changes, version: result.version, verificationEpoch: result.verificationEpoch, activatedAt: result.activatedAt };
    const next = { ...state, policy, controlActivated: result.controlActivated, state: result.controlActivated ? policy.isOpen ? ADMISSION_POLICY_PUBLIC_STATE.active : ADMISSION_POLICY_PUBLIC_STATE.paused : ADMISSION_POLICY_PUBLIC_STATE.draft,
      impact: { ...state.impact, contactTypeLocked: result.controlActivated, historicalLinksProtected: result.controlActivated } };
    const guarded = admissionPolicyStateResultSchema.parse(next);
    setState(guarded); if (intent.type !== ADMISSION_POLICY_OPERATION.pause) setDraft(createAdmissionPolicyDraft(guarded));
  };

  /** Persists before transport; uncertain/aborted writes retain their exact original UUID and payload. */
  const send = async (intent: AdmissionPolicyBrowserIntent) => {
    if (!ready || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller;
    setPhase(PHASE.writing); setFresh(false); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); setActivationAvailable(false);
    try {
      if (!await checkViewer(controller.signal)) return;
      writeAdmissionPolicyIntent(ready.viewerId, ready.slug, intent); pending.current = intent;
      const result = intent.type === ADMISSION_POLICY_OPERATION.initialize ? await client.initializePolicy(ready.slug, intent.input, controller.signal)
        : intent.type === ADMISSION_POLICY_OPERATION.update ? await client.updatePolicy(ready.slug, intent.input, controller.signal)
        : intent.type === ADMISSION_POLICY_OPERATION.activate ? await client.activatePolicy(ready.slug, intent.input, controller.signal)
        : await client.pausePolicy(ready.slug, intent.input, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "failed") {
        setErrorMessage(result.message);
        if (result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) {
          setReauthenticationOperation(intent.type === ADMISSION_POLICY_OPERATION.activate ? REAUTHENTICATION_OPERATION.activateAdmissionPolicy : intent.type === ADMISSION_POLICY_OPERATION.pause ? REAUTHENTICATION_OPERATION.pauseAdmissionPolicy : REAUTHENTICATION_OPERATION.updateAdmissionPolicy);
        } else if (!result.uncertain) { writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); pending.current = null; }
        return;
      }
      if (result.value.state === "started") { setErrorMessage(COPY.uncertain); return; }
      if (result.value.operationId !== intent.input.operationId) { setErrorMessage(COPY.uncertain); return; }
      applyResult(intent, result.value.result);
      writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); pending.current = null; setFresh(true); setStatusMessage(COPY.saved);
    } catch { if (!controller.signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally {
      if (writeController.current === controller) busy.current = false;
      if (!controller.signal.aborted) { setCanRetry(false); setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
    }
  };

  /** Creates a global recency intent only on an explicit user action and retains the original local command. */
  const prepareReauthentication = async () => {
    if (!ready || !reauthenticationOperation || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller; setPhase(PHASE.writing); setConfirmed(false);
    try {
      if (!await checkViewer(controller.signal)) return;
      const result = await reauthentication.create({ tribeId: ready.tribeId, resourceId: ready.tribeId, operation: reauthenticationOperation, returnPath: `/${encodeURIComponent(ready.slug)}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`, confirmed: true }, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "ready") setReauthenticationHref(result.href);
      else setErrorMessage("No pudimos preparar la confirmación de Google. Consultá el estado antes de continuar.");
    } catch { if (!controller.signal.aborted) setErrorMessage("No pudimos preparar la confirmación de Google. Consultá el estado antes de continuar."); }
    finally { if (writeController.current === controller) busy.current = false; if (!controller.signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : PHASE.uncertain); }
  };

  /** Preview is informational, abortable and invalidated by any edit; activation repeats authoritative checks. */
  const preflight = async () => {
    if (!ready || busy.current || !fresh) return;
    if (draftChanged) { setActivationAvailable(false); setConfirmed(false); setPreflightMessage(COPY.draftChanged); return; }
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller; setPhase(PHASE.reading); setConfirmed(false); setErrorMessage(null);
    try {
      if (!await checkViewer(controller.signal)) return;
      const result = await client.readPreflight(ready.slug, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "failed") { setErrorMessage(result.message); return; }
      setActivationAvailable(result.value.prepared); setPreflightMessage(result.value.prepared ? COPY.prepared : COPY.notPrepared);
    } catch { if (!controller.signal.aborted) setErrorMessage(ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable]); }
    finally { if (!controller.signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : PHASE.idle); }
  };

  if (!ready || !state || !draft) return <AdmissionRouteError embedded message={initialState.kind === "unavailable" ? initialState.message : COPY.storageFailed} reset={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">Consultando la cuenta y la configuración actual…</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} reset={launchRead} />;
  const reason = validateAdmissionPolicyBrowserDraft(draft, state);
  const validationMessage = reason === ADMISSION_POLICY_CONFIGURATION_ERROR.contactTypeLocked ? COPY.contactLocked : reason === ADMISSION_POLICY_CONFIGURATION_ERROR.phoneAllowlistVerificationRequired ? COPY.phoneAllowlist : reason === ADMISSION_POLICY_CONFIGURATION_ERROR.smsAlternativeInvalid ? COPY.smsAlternative : reason ? COPY.invalid : null;
  const uncertain = phase === PHASE.uncertain;
  const disabled = !fresh || uncertain, isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing;
  /** Creates a new UUID only after explicit confirmation; original uncertainty takes precedence. */
  const action = (type: AdmissionPolicyBrowserIntent["type"]) => {
    if (disabled || isBusy || !confirmed || pending.current || type !== ADMISSION_POLICY_OPERATION.pause && validationMessage) { setErrorMessage(COPY.invalid); return; }
    if (type === ADMISSION_POLICY_OPERATION.activate && !activationAvailable) { setErrorMessage(COPY.notPrepared); return; }
    const input = { operationId: newAdmissionOperationId(), confirmed: true, ...(type === ADMISSION_POLICY_OPERATION.initialize ? {} : { expectedVersion: state.policy?.version }), ...(type === ADMISSION_POLICY_OPERATION.update ? draft : {}), ...(type === ADMISSION_POLICY_OPERATION.pause ? { reason: pauseReason } : {}) };
    const parsed = admissionPolicyBrowserIntentSchema.safeParse({ type, input });
    if (!parsed.success) { setErrorMessage(COPY.invalid); return; }
    void send(parsed.data);
  };
  return <>
    <AdmissionPolicyForm state={state} draft={draft} confirmed={confirmed} canEdit={!disabled} busy={isBusy} errorMessage={errorMessage} validationMessage={validationMessage} preflightMessage={preflightMessage} activationAvailable={activationAvailable} pauseReason={pauseReason} usageSettingsHref={`/${encodeURIComponent(ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`} statusMessage={statusMessage} uncertain={uncertain} canRetry={canRetry && fresh} reauthenticationRequired={reauthenticationOperation !== null} reauthenticationHref={reauthenticationHref} onPrepareReauthentication={() => { void prepareReauthentication(); }}
      onChange={(next) => { setDraft(next); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); setActivationAvailable(false); setPreflightMessage(COPY.draftChanged); }}
      onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }} onPauseReason={(value) => { setPauseReason(value); setConfirmed(false); setErrorMessage(null); }}
      onInitialize={() => action(ADMISSION_POLICY_OPERATION.initialize)} onSave={() => action(ADMISSION_POLICY_OPERATION.update)} onActivate={() => action(ADMISSION_POLICY_OPERATION.activate)} onPause={() => action(ADMISSION_POLICY_OPERATION.pause)} onCheckPreflight={() => { void preflight(); }} onReloadCurrent={launchRead}
      onRetryOriginal={() => { if (pending.current && canRetry && fresh && confirmed && !isBusy) void send(pending.current); }} />
  </>;
}
