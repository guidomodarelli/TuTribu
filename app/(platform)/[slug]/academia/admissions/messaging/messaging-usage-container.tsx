"use client";
/** Owns native viewer checks, the guided save of countries and quotas, and original usage recovery; all form controls remain callback-only. @module messaging-usage-container */
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import type { MessagingUsagePageState } from "@/src/modules/messaging/application/results/messaging-usage-page-state";
import type { MessagingUsageBrowserClient } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingUsageDraft } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { describeMessagingUsageChangeImpact } from "@/src/modules/messaging/application/results/messaging-usage-change-impact";
import { createMessagingUsageDraft, parseMessagingUsageDraft, type MessagingUsageBrowserIntent } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";
import { MessagingUsage } from "@/components/academy-admissions/messaging-usage";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { resolveMessagingRouteRecovery } from "@/lib/messaging/messaging-route-recovery";
import { ROUTES } from "@/src/constants/routes";
import { messagingUsageBrowserClient } from "@/lib/messaging/messaging-usage-api-client";
import { MESSAGING_USAGE_BROWSER_PHASE as PHASE, MESSAGING_USAGE_UI_COPY as COPY, MESSAGING_USAGE_WRITE_STEP as WRITE_STEP, type MessagingUsageBrowserPhase, type MessagingUsageWriteStep } from "@/src/modules/messaging/constants/messaging-usage";
import { FIRST_STEP_INDEX, readUsageCurrent, retryUsageOriginal, saveUsageValues, type MessagingUsageControls, type MessagingUsageWriter } from "./messaging-usage-workflow";
import { startPrivateReadLifecycle } from "../private-read-lifecycle";

/** Own state/ports are the only workflow dependencies serialized or injected here. */
type UsageContainerProps = { initialState: MessagingUsagePageState; client?: MessagingUsageBrowserClient };

const WRITE_STEP_COPY: Record<MessagingUsageWriteStep, string> = { [WRITE_STEP.creating]: COPY.creating, [WRITE_STEP.saving]: COPY.saving };

/** @param props - Unavailable or incomplete server snapshot and the current location. @returns The embedded route error with its recovery. */
function MessagingUsageUnavailable({ initialState, pathname, search }: { initialState: MessagingUsagePageState; pathname: string; search: string }) {
  const unavailable = initialState.kind === "unavailable" ? initialState : null;
  return <AdmissionRouteError embedded message={unavailable?.message ?? COPY.storageFailed} {...resolveMessagingRouteRecovery(unavailable?.code ?? null, { pathname, search })} />;
}

/** @param props - Guarded server snapshot and optional own transport ports. @returns Account-scoped usage summary and guided steps with preserved draft, safe confirmation and no ordinary route refresh. */
export function MessagingUsageContainer({ initialState, client = messagingUsageBrowserClient }: UsageContainerProps) {
  // Outside an App Router context (isolated renders) both hooks return null at runtime despite their types.
  const pathname = (usePathname() as string | null) ?? ROUTES.home, searchParams = useSearchParams() as ReadonlyURLSearchParams | null;
  const ready = initialState.kind === "ready" ? initialState : null;
  const [state, setState] = useState(ready?.usage ?? null), [draft, setDraft] = useState<MessagingUsageDraft | null>(ready ? createMessagingUsageDraft(ready.usage) : null);
  const [phase, setPhase] = useState<MessagingUsageBrowserPhase>(PHASE.checking), [fresh, setFresh] = useState(false), [confirmed, setConfirmed] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false), [privateVisible, setPrivateVisible] = useState(true);
  const [editing, setEditing] = useState(!ready?.usage.policy), [step, setStep] = useState(FIRST_STEP_INDEX);
  const [writeStep, setWriteStep] = useState<MessagingUsageWriteStep | null>(null), [partialSave, setPartialSave] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** Starts from the server snapshot and follows every current read, so a resolved platform problem re-enables saving in the same session. */
  const [platformRequirement, setPlatformRequirementState] = useState<PlatformSecurityRequirement | null>(ready?.platformRequirement ?? null), currentPlatformRequirement = useRef(platformRequirement);
  const pending = useRef<MessagingUsageBrowserIntent | null>(null), loaded = useRef(false), busy = useRef(false);
  const mounted = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  /** Setters and refs never change identity, so one stable bundle serves every read and write. */
  const controls = useMemo<MessagingUsageControls>(() => ({ setState, setDraft, setPhase, setFresh, setConfirmed, setCanRetry, setRetryConfirmed, setPrivateVisible, setEditing, setStep, setWriteStep, setPartialSave, setErrorMessage, setStatusMessage,
    setPlatformRequirement: (value: PlatformSecurityRequirement | null) => { currentPlatformRequirement.current = value; setPlatformRequirementState(value); }, platformRequirement: currentPlatformRequirement, pending, loaded, busy, readController, writeController }), []);

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
    if (!ready) return;
    await readUsageCurrent({ ready, client, checkViewer, controls }, signal, initial);
  }, [ready, client, checkViewer, controls]);

  /** Explicit reads share a cancellable slot and cannot replace an active mutation. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setPrivateVisible(false); setErrorMessage(null); setConfirmed(false); void readCurrent(controller.signal);
  }, [readCurrent]);
  /** The restore listener always relaunches with the latest read, without making it a subscription dependency. */
  const relaunchRead = useEffectEvent(() => launchRead());
  /** Activity/bfcache restoration invalidates confirmation and reloads the original stored intent. */
  useEffect(() => startPrivateReadLifecycle(controls, {
    mounted, readCurrent,
    invalidate: () => { setPrivateVisible(false); setFresh(false); setConfirmed(false); },
    relaunch: () => { relaunchRead(); },
  }), [readCurrent, controls]);

  if (!ready || !state || !draft) return <MessagingUsageUnavailable initialState={initialState} pathname={pathname} search={searchParams?.toString() ?? ""} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing, uncertain = phase === PHASE.uncertain;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">Consultando la cuenta y el uso actual…</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} retry={launchRead} />;
  const parsedDraft = parseMessagingUsageDraft(draft, state), writer: MessagingUsageWriter = { ready, client, checkViewer, controls, readCurrent };
  /** While the platform cannot protect a save, nothing on this page can be written; the saved configuration stays readable. */
  const platformBlocked = platformRequirement !== null;
  const canSave = fresh && !isBusy && !uncertain && !platformBlocked && confirmed && parsedDraft.ok;
  /** A new UUID is created only after validation/current read and a fresh human confirmation, never while an original is pending. */
  const save = () => {
    if (!canSave || pending.current) { setErrorMessage(COPY.invalid); return; }
    void saveUsageValues(writer, state.policy, parsedDraft.value);
  };
  /** @returns Nothing after restoring the current configuration as the draft, without consent or error. */
  const resetDraft = () => { setDraft(createMessagingUsageDraft(state)); setConfirmed(false); setStep(FIRST_STEP_INDEX); setErrorMessage(null); };
  return <MessagingUsage state={state} draft={draft} countryChoices={ready.countryChoices} editing={editing || !state.policy} step={step} confirmed={confirmed}
    busy={isBusy} saving={phase === PHASE.writing} progressMessage={writeStep && WRITE_STEP_COPY[writeStep]} canEdit={fresh && !uncertain && !platformBlocked} platformRequirement={platformRequirement}
    impact={parsedDraft.ok && state.policy ? describeMessagingUsageChangeImpact(state.policy, parsedDraft.value) : null}
    validationMessage={parsedDraft.ok ? null : parsedDraft.message} errorMessage={errorMessage} statusMessage={statusMessage} partialMessage={partialSave ? COPY.initializedOnly : null} canRetrySave={partialSave && canSave}
    uncertain={uncertain} canRetry={canRetry && fresh && !platformBlocked} retryConfirmed={retryConfirmed}
    onChange={(next) => { setDraft(next); setConfirmed(false); setErrorMessage(null); setStatusMessage(null); }}
    onConfirm={(value) => { setConfirmed(value); setErrorMessage(null); }}
    onStepChange={(next) => { setStep(next); setStatusMessage(null); }}
    onStartEditing={() => { if (isBusy || uncertain || platformBlocked) return; resetDraft(); setStatusMessage(null); setEditing(true); }}
    onCancelEditing={() => { if (isBusy) return; resetDraft(); setPartialSave(false); setEditing(false); }}
    onSave={save} onReloadCurrent={launchRead} onRetryConfirm={(value) => { setRetryConfirmed(value); setErrorMessage(null); }}
    onRetryOriginal={() => { if (pending.current && canRetry && fresh && !platformBlocked && retryConfirmed && !isBusy) void retryUsageOriginal(writer, state.policy, pending.current); }} />;
}
