"use client";
/** Owns native viewer checks and original usage recovery; all form controls remain callback-only. @module messaging-usage-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "beez-ui";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingUsageReauthenticationClient } from "@/src/modules/messaging/application/ports/messaging-usage-reauthentication-client";
import type { MessagingUsageDraft } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import { createMessagingUsageDraft, parseMessagingUsageDraft, messagingUsageBrowserIntentSchema, type MessagingUsageBrowserIntent } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";
import { messagingUsagePolicyStateSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { MessagingUsage } from "@/components/academy-admissions/messaging-usage";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { messagingUsageBrowserClient } from "@/lib/messaging/messaging-usage-api-client";
import { messagingUsageReauthenticationClient } from "@/lib/messaging/messaging-usage-reauthentication-client";
import { readMessagingUsageIntent, writeMessagingUsageIntent } from "@/lib/messaging/messaging-usage-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { MESSAGING_USAGE_BROWSER_PHASE as PHASE, MESSAGING_USAGE_UI_COPY as COPY, MESSAGING_USAGE_RECOVERABLE_OPERATION as OPERATION, MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Own state/ports are the only workflow dependencies serialized or injected here. */
type UsageContainerProps = { initialState: MessagingUsagePageState; client?: MessagingUsageBrowserClient; reauthentication?: MessagingUsageReauthenticationClient };
/** @param props - Guarded server snapshot and optional own transport ports. @returns Account-scoped early usage with preserved draft, safe confirmation and no ordinary route refresh. */
export function MessagingUsageContainer({ initialState, client = messagingUsageBrowserClient, reauthentication = messagingUsageReauthenticationClient }: UsageContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const [state, setState] = useState(ready?.usage ?? null), [draft, setDraft] = useState<MessagingUsageDraft | null>(ready ? createMessagingUsageDraft(ready.usage) : null);
  const [phase, setPhase] = useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking), [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reauthenticationOperation, setReauthenticationOperation] = useState<MessagingUsageBrowserIntent["type"] | null>(null), [reauthenticationHref, setReauthenticationHref] = useState<string | null>(null);
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
    setPhase(PHASE.reading); setFresh(false); setConfirmed(false); setCanRetry(false);
    let recovered = false;
    try {
      if (!await checkViewer(signal)) return;
      if (!loaded.current) {
        pending.current = readMessagingUsageIntent(ready.viewerId, ready.slug); loaded.current = true;
        if (pending.current?.type === OPERATION.update) setDraft({ allowedCountries: [...pending.current.input.allowedCountries], verificationDailyLimit: String(pending.current.input.verificationDailyLimit), notificationDailyLimit: String(pending.current.input.notificationDailyLimit) });
      }
      if (pending.current) {
        const intent = pending.current, original = await client.operation(ready.slug, intent.input.operationId, signal);
        if (signal.aborted || original.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (original.status === "ready") {
          if (original.value.type !== intent.type || original.value.operationId !== intent.input.operationId || original.value.state !== "completed") { setErrorMessage(COPY.uncertain); return; }
          writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null; recovered = true; setStatusMessage(COPY.recovered); setReauthenticationOperation(null); setReauthenticationHref(null);
        } else if (original.code === MESSAGING_ERROR_CODE.resourceUnavailable) { setCanRetry(true); setErrorMessage(COPY.retry); }
        else { setErrorMessage(original.message); return; }
      }
      if (!initial || recovered || pending.current) {
        const current = await client.read(ready.slug, signal);
        if (signal.aborted || current.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (current.status === "failed") { setErrorMessage(current.message); return; }
        setState(current.value);
      }
      setFresh(true); setPrivateVisible(true);
    } catch { if (!signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally { if (!signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer]);

  /** Explicit reads share a cancellable slot and cannot replace an active mutation. */
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
    /** Activity/bfcache restoration invalidates confirmation and reloads the original stored intent. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setPrivateVisible(false); setFresh(false); setConfirmed(false); writeController.current?.abort(); busy.current = false; loaded.current = false; launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); busy.current = false; loaded.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead]);

  /** Stores the immutable command before posting; replay follows a current read instead of overwriting the current resource. */
  const send = async (intent: MessagingUsageBrowserIntent) => {
    if (!ready || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller;
    setPhase(PHASE.writing); setFresh(false); setConfirmed(false); setCanRetry(false); setErrorMessage(null); setStatusMessage(null);
    try {
      if (!await checkViewer(controller.signal)) return;
      writeMessagingUsageIntent(ready.viewerId, ready.slug, intent); pending.current = intent;
      const result = intent.type === OPERATION.initialize ? await client.initialize(ready.slug, intent.input, controller.signal) : await client.update(ready.slug, intent.input, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "failed") {
        setErrorMessage(result.message); toast.error(result.message);
        if (result.code === MESSAGING_ERROR_CODE.reauthenticationRequired) setReauthenticationOperation(intent.type);
        else if (!result.uncertain) { writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null; }
        return;
      }
      if (result.value.operationId !== intent.input.operationId || result.value.state !== "completed") { setErrorMessage(COPY.uncertain); return; }
      if (result.value.replayed) { await readCurrent(controller.signal); return; }
      const projected = messagingUsagePolicyStateSchema.parse({ state: "configured", policy: result.value.result });
      if (intent.type === OPERATION.update && (!state?.policy || state.policy.version !== intent.input.expectedVersion || projected.policy!.version < state.policy.version || projected.policy!.version > state.policy.version + 1)) { setErrorMessage(COPY.uncertain); return; }
      setState(projected);
      writeMessagingUsageIntent(ready.viewerId, ready.slug, null); pending.current = null; setFresh(true); setStatusMessage(COPY.saved); setReauthenticationOperation(null); setReauthenticationHref(null); toast.success(COPY.saved);
      // Initialization persists server defaults while retaining the user's prepared draft for a separate PUT.
    } catch { if (!controller.signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally { if (writeController.current === controller) busy.current = false; if (!controller.signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  };

  /** Preparing recency is an explicit action and never resends the retained usage mutation. */
  const prepareReauthentication = async () => {
    if (!ready || !reauthenticationOperation || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller; setPhase(PHASE.writing); setConfirmed(false);
    try {
      if (!await checkViewer(controller.signal)) return;
      const result = await reauthentication.create({ tribeId: ready.tribeId, resourceId: ready.tribeId, operation: reauthenticationOperation, returnPath: `/${encodeURIComponent(ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`, confirmed: true }, controller.signal);
      if (controller.signal.aborted || result.status === "aborted") return;
      if (!await checkViewer(controller.signal)) return;
      if (result.status === "ready") setReauthenticationHref(result.href); else setErrorMessage(COPY.reauthenticationFailed);
    } catch { if (!controller.signal.aborted) setErrorMessage(COPY.reauthenticationFailed); }
    finally { if (writeController.current === controller) busy.current = false; if (!controller.signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : PHASE.uncertain); }
  };

  if (!ready || !state || !draft) return <AdmissionRouteError embedded message={initialState.kind === "unavailable" ? initialState.message : COPY.storageFailed} reset={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">Consultando la cuenta y el uso actual…</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} reset={launchRead} />;
  const parsedDraft = parseMessagingUsageDraft(draft, state), validationMessage = parsedDraft.ok ? null : parsedDraft.message;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing, uncertain = phase === PHASE.uncertain;
  /** A new UUID is created only after validation/current read and a fresh human confirmation. */
  const act = (type: MessagingUsageBrowserIntent["type"]) => {
    if (!fresh || isBusy || pending.current || !confirmed || type === OPERATION.update && !parsedDraft.ok) { setErrorMessage(COPY.invalid); return; }
    const input = { operationId: newAdmissionOperationId(), confirmed: true, ...(type === OPERATION.update && parsedDraft.ok ? { expectedVersion: state.policy?.version, ...parsedDraft.value } : {}) };
    const parsed = messagingUsageBrowserIntentSchema.safeParse({ type, input });
    if (!parsed.success) { setErrorMessage(COPY.invalid); return; }
    void send(parsed.data);
  };
  return <MessagingUsage state={state} draft={draft} countryChoices={ready.countryChoices} confirmed={confirmed} busy={isBusy} canEdit={fresh && !uncertain} validationMessage={validationMessage} errorMessage={errorMessage} statusMessage={statusMessage} uncertain={uncertain} canRetry={canRetry && fresh}
    onChange={(next) => { setDraft(next); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); }} onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }} onInitialize={() => act(OPERATION.initialize)} onSave={() => act(OPERATION.update)} onReloadCurrent={launchRead}
    onRetryOriginal={() => { if (pending.current && canRetry && fresh && confirmed && !isBusy) void send(pending.current); }} reauthenticationRequired={reauthenticationOperation !== null} reauthenticationHref={reauthenticationHref} onPrepareReauthentication={() => { void prepareReauthentication(); }} />;
}
