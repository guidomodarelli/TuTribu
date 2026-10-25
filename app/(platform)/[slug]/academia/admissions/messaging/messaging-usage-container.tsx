"use client";
/** Owns native viewer checks, the guided save of countries and quotas, and original usage recovery; all form controls remain callback-only. @module messaging-usage-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingUsageDraft } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import type { MessagingErrorCode } from "@/src/modules/messaging/application/results/messaging-errors";
import { describeMessagingUsageChangeImpact } from "@/src/modules/messaging/application/results/messaging-usage-change-impact";
import { createMessagingUsageDraft, parseMessagingUsageDraft, messagingUsageBrowserIntentSchema, type MessagingUsageBrowserIntent } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";
import { messagingUsagePolicyStateSchema, type MessagingUsagePolicyDto } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { MessagingUsage } from "@/components/academy-admissions/messaging-usage";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { resolveMessagingRouteRecovery } from "@/lib/messaging/messaging-route-recovery";
import { ROUTES } from "@/src/constants/routes";
import { messagingUsageBrowserClient } from "@/lib/messaging/messaging-usage-api-client";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { MESSAGING_USAGE_BROWSER_PHASE as PHASE, MESSAGING_USAGE_UI_COPY as COPY, MESSAGING_USAGE_RECOVERABLE_OPERATION as OPERATION, MESSAGING_USAGE_PRIVATE_AUTHORITY_FAILURES, MESSAGING_USAGE_STEP, MESSAGING_USAGE_STEP_ORDER, MESSAGING_USAGE_WRITE_STEP as WRITE_STEP, type MessagingUsageBrowserPhase, type MessagingUsageWriteStep } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_USAGE_POLICY_STATE } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Own state/ports are the only workflow dependencies serialized or injected here. */
type UsageContainerProps = { initialState: MessagingUsagePageState; client?: MessagingUsageBrowserClient };
/** Normalized values the leader confirmed in the review step. */
type MessagingUsageValues = { allowedCountries: string[]; verificationDailyLimit: number; notificationDailyLimit: number };
/** Outcome of one stored write: the confirmed policy, a reported failure, or a stop whose feedback is already shown. */
type MessagingUsageWriteOutcome = { status: "completed"; policy: MessagingUsagePolicyDto } | { status: "failed"; code: MessagingErrorCode; uncertain: boolean } | { status: "stopped" };

const STOPPED: MessagingUsageWriteOutcome = { status: "stopped" };
const REVIEW_STEP_INDEX = MESSAGING_USAGE_STEP_ORDER.indexOf(MESSAGING_USAGE_STEP.review);
const FIRST_STEP_INDEX = 0;
const WRITE_STEP_COPY: Record<MessagingUsageWriteStep, string> = { [WRITE_STEP.creating]: COPY.creating, [WRITE_STEP.saving]: COPY.saving };

/** @param policy - Configuration just created. @param values - Values the leader confirmed. @returns True when the created configuration already holds them, so no second write is needed. */
function holdsValues(policy: MessagingUsagePolicyDto, values: MessagingUsageValues) {
  return policy.verificationDailyLimit === values.verificationDailyLimit && policy.notificationDailyLimit === values.notificationDailyLimit
    && policy.allowedCountries.length === values.allowedCountries.length && values.allowedCountries.every((country) => policy.allowedCountries.includes(country));
}

/** @param props - Guarded server snapshot and optional own transport ports. @returns Account-scoped usage summary and guided steps with preserved draft, safe confirmation and no ordinary route refresh. */
export function MessagingUsageContainer({ initialState, client = messagingUsageBrowserClient }: UsageContainerProps) {
  const pathname = usePathname() ?? ROUTES.home, searchParams = useSearchParams();
  const ready = initialState.kind === "ready" ? initialState : null;
  const [state, setState] = useState(ready?.usage ?? null), [draft, setDraft] = useState<MessagingUsageDraft | null>(ready ? createMessagingUsageDraft(ready.usage) : null);
  const [phase, setPhase] = useState<MessagingUsageBrowserPhase>(PHASE.checking), [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [editing, setEditing] = useState(!ready?.usage.policy), [step, setStep] = useState(FIRST_STEP_INDEX);
  const [writeStep, setWriteStep] = useState<MessagingUsageWriteStep | null>(null), [partialSave, setPartialSave] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pending = useRef<MessagingUsageBrowserIntent | null>(null), loaded = useRef(false), busy = useRef(false);
  const mounted = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);

  /** Native identity is checked before local restoration and after every private asynchronous result. */
  const checkViewer = useCallback(async (signal: AbortSignal) => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { setFresh(false); setPrivateVisible(false); setErrorMessage(viewer.message); return false; }
    if (viewer.value?.id !== ready.viewerId) { setFresh(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client]);

  /** Reads original work before current configuration; recovery never installs an historical version as today's state. */
  const readCurrent = useCallback(async (signal: AbortSignal, initial = false) => {
    if (!ready || signal.aborted) return;
    if (!initial) setPrivateVisible(false);
    setPhase(PHASE.reading); setFresh(false); setConfirmed(false); setRetryConfirmed(false); setCanRetry(false);
    let recovered = false;
    try {
      if (!await checkViewer(signal) || signal.aborted) return;
      if (!loaded.current) {
        pending.current = readMessagingUsageIntent(ready.viewerId, ready.slug); loaded.current = true;
        if (pending.current?.type === OPERATION.update) {
          setDraft({ allowedCountries: [...pending.current.input.allowedCountries], verificationDailyLimit: String(pending.current.input.verificationDailyLimit), notificationDailyLimit: String(pending.current.input.notificationDailyLimit) });
          setEditing(true); setStep(REVIEW_STEP_INDEX);
        }
      }
      if (pending.current) {
        setPrivateVisible(false);
        const intent = pending.current, original = await client.operation(ready.slug, intent.input.operationId, signal);
        if (signal.aborted || original.status === "aborted") return;
        if (!await checkViewer(signal) || signal.aborted) return;
        if (original.status === "ready") {
          if (original.value.type !== intent.type || original.value.operationId !== intent.input.operationId || original.value.state !== "completed") { setErrorMessage(COPY.uncertain); return; }
          writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null; recovered = true; setStatusMessage(COPY.recovered);
          setEditing(false); setPartialSave(false); setStep(FIRST_STEP_INDEX);
        } else if (original.code === MESSAGING_ERROR_CODE.resourceUnavailable) { setCanRetry(true); setErrorMessage(COPY.retry); }
        else { setErrorMessage(original.message); return; }
      }
      if (!initial || recovered || pending.current) {
        const current = await client.read(ready.slug, signal);
        if (signal.aborted || current.status === "aborted") return;
        if (!await checkViewer(signal) || signal.aborted) return;
        if (current.status === "failed") { setErrorMessage(current.message); return; }
        setState(current.value);
        if (!current.value.policy) setEditing(true);
      }
      setFresh(true); setPrivateVisible(true);
    } catch { if (!signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally { if (!signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer]);

  /** Explicit reads share a cancellable slot and cannot replace an active mutation. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setPrivateVisible(false); setErrorMessage(null); setConfirmed(false); void readCurrent(controller.signal);
  }, [readCurrent]);
  useEffect(() => {
    const controller = new AbortController(); readController.current = controller;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { setPrivateVisible(false); setFresh(false); setConfirmed(false); }
      return readCurrent(controller.signal, initial);
    });
    /** Activity/bfcache restoration invalidates confirmation and reloads the original stored intent. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setPrivateVisible(false); setFresh(false); setConfirmed(false); writeController.current?.abort(); busy.current = false; loaded.current = false; launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); busy.current = false; loaded.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /**
   * Stores the immutable command before posting and checks the answer against the configuration it starts from.
   * @param intent - Validated original command.
   * @param signal - Signal of the active write session.
   * @param base - Configuration an update expects; null for initialization.
   * @returns The confirmed policy, a reported failure, or a stop whose feedback is already shown.
   */
  const write = async (intent: MessagingUsageBrowserIntent, signal: AbortSignal, base: MessagingUsagePolicyDto | null): Promise<MessagingUsageWriteOutcome> => {
    if (!ready) return STOPPED;
    writeMessagingUsageIntent(ready.viewerId, ready.slug, intent); pending.current = intent;
    const result = intent.type === OPERATION.initialize ? await client.initialize(ready.slug, intent.input, signal) : await client.update(ready.slug, intent.input, signal);
    if (signal.aborted || result.status === "aborted") return STOPPED;
    if (!await checkViewer(signal) || signal.aborted) return STOPPED;
    if (result.status === "failed") {
      setErrorMessage(result.message);
      if (MESSAGING_USAGE_PRIVATE_AUTHORITY_FAILURES.includes(result.code)) { setPrivateVisible(false); setCanRetry(false); return STOPPED; }
      /** A legacy session-change answer keeps the original intent so reloading can still recover it. */
      if (!result.uncertain && result.code !== MESSAGING_ERROR_CODE.reauthenticationRequired) { writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null; }
      return { status: "failed", code: result.code, uncertain: pending.current !== null };
    }
    if (result.value.operationId !== intent.input.operationId || result.value.state !== "completed") { setErrorMessage(COPY.uncertain); return { status: "failed", code: MESSAGING_ERROR_CODE.operationUnresolved, uncertain: true }; }
    if (result.value.replayed) { await readCurrent(signal); return STOPPED; }
    const projected = messagingUsagePolicyStateSchema.parse({ state: MESSAGING_USAGE_POLICY_STATE.configured, policy: result.value.result });
    if (!projected.policy) return STOPPED;
    if (intent.type === OPERATION.update && (!base || base.version !== intent.input.expectedVersion || projected.policy.version < base.version || projected.policy.version > base.version + 1)) { setErrorMessage(COPY.uncertain); return { status: "failed", code: MESSAGING_ERROR_CODE.operationUnresolved, uncertain: true }; }
    setState(projected);
    writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null;
    return { status: "completed", policy: projected.policy };
  };

  /** Runs one exclusive, cancellable write session; reads cannot replace it and its phase settles to idle or uncertain. */
  const runWriteSession = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (!ready || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller;
    setPhase(PHASE.writing); setFresh(false); setCanRetry(false); setRetryConfirmed(false); setErrorMessage(null); setStatusMessage(null);
    try {
      if (!await checkViewer(controller.signal) || controller.signal.aborted) return;
      await work(controller.signal);
    } catch { if (!controller.signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally {
      setWriteStep(null);
      if (writeController.current === controller) busy.current = false;
      if (!controller.signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle);
    }
  };

  /** Announces only a configuration the server confirmed, then returns to the summary. */
  const finishSaved = (policy: MessagingUsagePolicyDto) => {
    setFresh(true); setConfirmed(false); setPartialSave(false); setEditing(false); setStep(FIRST_STEP_INDEX);
    setDraft(createMessagingUsageDraft({ state: MESSAGING_USAGE_POLICY_STATE.configured, policy }));
    setStatusMessage(COPY.saved);
  };

  /**
   * Saves the confirmed values; without a configuration it first creates one with the server defaults and then updates it.
   * @param values - Values confirmed in the review step.
   */
  const saveValues = (values: MessagingUsageValues) => runWriteSession(async (signal) => {
    setPartialSave(false);
    let base = state?.policy ?? null, created = false;
    try {
      if (!base) {
        setWriteStep(WRITE_STEP.creating);
        const initialization = await write(messagingUsageBrowserIntentSchema.parse({ type: OPERATION.initialize, input: { operationId: newAdmissionOperationId(), confirmed: true } }), signal, null);
        if (initialization.status !== "completed") return;
        base = initialization.policy; created = true;
        if (holdsValues(base, values)) { finishSaved(base); return; }
      }
      setWriteStep(WRITE_STEP.saving);
      const saved = await write(messagingUsageBrowserIntentSchema.parse({ type: OPERATION.update, input: { operationId: newAdmissionOperationId(), confirmed: true, expectedVersion: base.version, ...values } }), signal, base);
      if (saved.status === "completed") { finishSaved(saved.policy); return; }
      if (created && saved.status === "failed") {
        setPartialSave(true);
        /** The created configuration is current unless the answer proves a concurrent change, so a certain failure may be retried right away. */
        if (!saved.uncertain && saved.code !== MESSAGING_ERROR_CODE.usagePolicyConflict) setFresh(true);
      }
    } catch (error) { if (created) setPartialSave(true); throw error; }
  });

  /** Repeats the stored original command with its own identity; it never creates a new operation while the original is uncertain. */
  const retryOriginal = (intent: MessagingUsageBrowserIntent) => runWriteSession(async (signal) => {
    const outcome = await write(intent, signal, state?.policy ?? null);
    if (outcome.status !== "completed") return;
    if (intent.type === OPERATION.update) { finishSaved(outcome.policy); return; }
    setFresh(true); setStatusMessage(COPY.initialized);
  });

  if (!ready || !state || !draft) return <AdmissionRouteError embedded message={initialState.kind === "unavailable" ? initialState.message : COPY.storageFailed} {...resolveMessagingRouteRecovery(initialState.kind === "unavailable" ? initialState.code : null, { pathname, search: searchParams?.toString() ?? "" })} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">Consultando la cuenta y el uso actual…</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} retry={launchRead} />;
  const parsedDraft = parseMessagingUsageDraft(draft, state), validationMessage = parsedDraft.ok ? null : parsedDraft.message;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing, uncertain = phase === PHASE.uncertain;
  const canSave = fresh && !isBusy && !uncertain && confirmed && parsedDraft.ok;
  /** A new UUID is created only after validation/current read and a fresh human confirmation, never while an original is pending. */
  const save = () => {
    if (!canSave || pending.current || !parsedDraft.ok) { setErrorMessage(COPY.invalid); return; }
    void saveValues(parsedDraft.value);
  };
  return <MessagingUsage state={state} draft={draft} countryChoices={ready.countryChoices} editing={editing || !state.policy} step={step} confirmed={confirmed}
    busy={isBusy} saving={phase === PHASE.writing} progressMessage={writeStep ? WRITE_STEP_COPY[writeStep] : null} canEdit={fresh && !uncertain}
    impact={state.policy && parsedDraft.ok ? describeMessagingUsageChangeImpact(state.policy, parsedDraft.value) : null}
    validationMessage={validationMessage} errorMessage={errorMessage} statusMessage={statusMessage} partialMessage={partialSave ? COPY.initializedOnly : null} canRetrySave={partialSave && canSave}
    uncertain={uncertain} canRetry={canRetry && fresh} retryConfirmed={retryConfirmed}
    onChange={(next) => { setDraft(next); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); }}
    onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }}
    onStepChange={(next) => { setStep(next); setStatusMessage(null); }}
    onStartEditing={() => { if (isBusy || uncertain) return; setDraft(createMessagingUsageDraft(state)); setConfirmed(false); setStep(FIRST_STEP_INDEX); setErrorMessage(null); setStatusMessage(null); setEditing(true); }}
    onCancelEditing={() => { if (isBusy) return; setDraft(createMessagingUsageDraft(state)); setConfirmed(false); setStep(FIRST_STEP_INDEX); setErrorMessage(null); setPartialSave(false); setEditing(false); }}
    onSave={save} onReloadCurrent={launchRead} onRetryConfirm={(value) => { setRetryConfirmed(value); setErrorMessage(null); }}
    onRetryOriginal={() => { if (pending.current && canRetry && fresh && retryConfirmed && !isBusy) void retryOriginal(pending.current); }} />;
}
