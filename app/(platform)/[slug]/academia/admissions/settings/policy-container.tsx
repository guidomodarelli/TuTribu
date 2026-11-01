"use client";
/** Owns current viewer checks, the chained rules writes and original policy reconciliation; the presenter has no transport. @module admission-policy-container */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionPolicyBrowserClient, AdmissionPolicyPreflightDto  } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { createAdmissionPolicyDraft, validateAdmissionPolicyBrowserDraft, type AdmissionPolicyBrowserIntent } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import { AdmissionPolicyForm, type AdmissionPolicyActivationBlock, type AdmissionPolicyFailure, admissionPolicyStepIds  } from "@/components/academy-admissions/admission-policy-form";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { ADMISSION_POLICY_BROWSER_PHASE as PHASE, ADMISSION_POLICY_BROWSER_COPY as COPY, ADMISSION_POLICY_DRAFT_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_ACTION, ADMISSION_POLICY_FLOW_STAGE as STAGE, type AdmissionPolicyAction, type AdmissionPolicyFlowStage, ADMISSION_POLICY_STEP, isAdmissionPolicyPlatformReason, type AdmissionPolicyEntryStep  } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_POLICY_PUBLIC_STATE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { withPolicyReviewReturn } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import { ROUTES } from "@/src/constants/routes";
import { blockReasons, createInitialDraft, draftBlock, markPolicyFresh, pausePolicyWrites, policyValidationMessage, readPolicyCurrent, resumePolicyWrites, retryPolicyOriginal, runFinalPolicyWrites, runPolicyWrite, startPolicyRecheck, type PolicyControls, type PolicyPhase, type PolicyReady, type PolicySession } from "./policy-workflow";
import { startPrivateReadLifecycle } from "../private-read-lifecycle";

/** Only application props and own ports enter the workflow; no SDK identity is serialized. */
type PolicyContainerProps = {
  initialState: AdmissionPolicyPageState; client?: AdmissionPolicyBrowserClient;
  /** Server-read informational preflight of a saved, not activated draft; null when it could not be read. */
  initialPreflight?: AdmissionPolicyPreflightDto | null;
  /** Allowlisted step opened by a link (guide, return from another settings page). */
  entryStep?: AdmissionPolicyEntryStep | null;
};
/** Server snapshot and the step the guided flow opens on. */
type PolicyInitialView = { ready: PolicyReady | null; client: AdmissionPolicyBrowserClient; savedDraft: boolean; initialStep: number; entryStep: AdmissionPolicyEntryStep | null; initialPreflight: AdmissionPolicyPreflightDto | null | undefined };

/** @param initial - Server snapshot and the step the flow opens on. @returns Every state of the rules flow, its explicit read and the stable controls; it reads on mount and after a restored page. */
function usePolicyFlowState({ ready, client, savedDraft, initialStep, entryStep, initialPreflight }: PolicyInitialView) {
  const [state, setState] = useState(ready?.policy ?? null);
  const [draft, setDraft] = useState<AdmissionPolicyDraft | null>(ready ? createInitialDraft(ready.policy) : null);
  const [phase, setPhase] = useState<PolicyPhase>(PHASE.checking);
  const [step, setStep] = useState(initialStep), [editing, setEditing] = useState(false);
  /** True while saved rules are being published from the draft notice or a return link. */
  const [publishing, setPublishing] = useState(savedDraft && entryStep !== null);
  const [rechecking, setRechecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [retryConfirmed, setRetryConfirmed] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false), [pauseReason, setPauseReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AdmissionPolicyFailure | null>(null), [activationBlock, setActivationBlock] = useState<AdmissionPolicyActivationBlock | null>(savedDraft ? draftBlock(initialPreflight, ready?.policy ?? null) : null);
  const [stage, setStage] = useState<AdmissionPolicyFlowStage | null>(null), [pendingAction, setPendingAction] = useState<AdmissionPolicyAction | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [fresh, setFresh] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const stateRef = useRef(state), freshRef = useRef(false);
  const pending = useRef<AdmissionPolicyBrowserIntent | null>(null), loaded = useRef(false), busy = useRef(false);
  const mounted = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  /** Setters and refs never change identity, so one stable bundle serves every read and write. */
  const controls = useMemo<PolicyControls>(() => ({ setState, setDraft, setPhase, setStep, setEditing, setRechecking, setConfirmed, setRetryConfirmed, setPauseOpen, setPauseReason, setErrorMessage, setStatusMessage, setFailure, setActivationBlock, setStage, setPendingAction, setPermissionDenied, setFresh, setCanRetry, setPrivateVisible, stateRef, freshRef, pending, loaded, busy, readController, writeController }), []);
  /** Retrieves original identity first; historical results never replace today's configuration. */
  const readCurrent = useCallback(async (signal: AbortSignal, restore = false) => {
    if (!ready) return;
    await readPolicyCurrent({ ready, client, controls }, signal, restore);
  }, [ready, client, controls]);

  /** Explicit reads use one cancellable slot and cannot replace an in-flight write. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setErrorMessage(null); void readCurrent(controller.signal);
  }, [readCurrent]);

  /** Activity/bfcache restoration must reload the original intention before any new write. */
  useEffect(() => startPrivateReadLifecycle(controls, {
    mounted, readCurrent,
    invalidate: () => { setPrivateVisible(false); markPolicyFresh(controls, false); setConfirmed(false); },
    relaunch: launchRead,
  }), [readCurrent, launchRead, controls]);

  return { state, draft, phase, step, editing, publishing, setPublishing, rechecking, confirmed, retryConfirmed, pauseOpen, pauseReason, errorMessage, statusMessage, failure, activationBlock, stage, pendingAction, permissionDenied, fresh, canRetry, privateVisible, launchRead, controls };
}

/** @param props - Container props. @returns The readable snapshot and the step and publishing state the flow opens with. */
function policyInitialView(props: PolicyContainerProps) {
  const ready = props.initialState.kind === "ready" ? props.initialState : null, entryStep = props.entryStep ?? null;
  const savedDraft = Boolean(ready?.policy.policy) && !ready?.policy.controlActivated;
  return { ready, savedDraft, entryStep, initialStep: initialPolicyStep(savedDraft, entryStep) };
}

/** @param savedDraft - Whether saved rules wait for activation. @param entryStep - Step a link opened. @returns The step the guided flow opens on. */
function initialPolicyStep(savedDraft: boolean, entryStep: AdmissionPolicyEntryStep | null): number {
  if (!savedDraft || !entryStep) return 0;
  return admissionPolicyStepIds(false).indexOf(ADMISSION_POLICY_STEP.review);
}

/** @param props - Safe SSR state and an optional own transport port. @returns A current account-scoped guided flow that retains draft/UUID through conflict and uncertainty. */
export function AdmissionPolicyContainer({ client = admissionApiClient, ...props }: PolicyContainerProps) {
  const { initialState } = props, { ready, ...initial } = policyInitialView(props);
  const flow = usePolicyFlowState({ ready, client, ...initial, initialPreflight: props.initialPreflight });
  const { state, draft, phase, editing, publishing, setPublishing, confirmed, errorMessage, failure, fresh, canRetry, privateVisible, launchRead, controls } = flow;
  if (!ready || !state || !draft) return <AdmissionRouteError embedded message={initialState.kind === "unavailable" ? initialState.message : COPY.storageFailed} retry={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} retry={() => window.location.reload()} />;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">{COPY.reading}</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} retry={launchRead} />;
  const session: PolicySession = { ready, client, controls };
  const validationMessage = policyValidationMessage(validateAdmissionPolicyBrowserDraft(draft, state));
  const uncertain = phase === PHASE.uncertain;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing;
  /** New writes stay closed while an original is unresolved or the configuration needs authorized review. */
  const writesOpen = !isBusy && !uncertain && state.state !== ADMISSION_POLICY_PUBLIC_STATE.unavailable;
  const view = policyFormView({ ready, state, draft, editing, activationBlock: flow.activationBlock });

  /** Guardar y activar / Guardar cambios: creates the policy if missing, saves the rules, checks requirements and activates, stopping where something fails. */
  const runFinal = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.final) => {
    if (!writesOpen || controls.pending.current || !confirmed || validationMessage) return;
    const plan = { proposed: draft, activating: !editing, previousFailure: failure };
    void runPolicyWrite(session, action, (signal) => runFinalPolicyWrites(session, plan, signal));
  };
  /** Closes new requests with the reason the contract requires; the saved draft closes too. */
  const pause = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.pause) => {
    if (!writesOpen || controls.pending.current || !flow.pauseReason.trim()) return;
    void runPolicyWrite(session, action, (signal) => pausePolicyWrites(session, flow.pauseReason, signal));
  };
  /** Reopens new requests by saving the current rules with intake enabled; the server rechecks readiness. */
  const resume = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.resume) => {
    if (!writesOpen || controls.pending.current) return;
    void runPolicyWrite(session, action, (signal) => resumePolicyWrites(session, signal));
  };
  /** Retries the failed sub-step with a new operation; completed sub-steps are skipped because the state already reflects them. */
  const retry = () => {
    if (failure?.stage === STAGE.pausing) pause(ADMISSION_POLICY_ACTION.retry);
    else if (failure?.stage === STAGE.resuming) resume(ADMISSION_POLICY_ACTION.retry);
    else runFinal(ADMISSION_POLICY_ACTION.retry);
  };
  /** Resends the exact original payload and UUID only after it was confirmed absent and the viewer confirmed again. */
  const retryOriginal = () => {
    const intent = controls.pending.current;
    if (!intent || !canRetry || !fresh || !flow.retryConfirmed || isBusy) return;
    void runPolicyWrite(session, ADMISSION_POLICY_ACTION.original, (signal) => retryPolicyOriginal(session, intent, signal));
  };
  /** Clears feedback that described the previous draft. */
  const clearFeedback = () => { controls.setErrorMessage(null); controls.setStatusMessage(null); controls.setFailure(null); controls.setActivationBlock(null); };
  /** @param next - Draft shown again. @returns Nothing after leaving consent and feedback of the previous draft. */
  const restart = (next: AdmissionPolicyDraft) => { controls.setStep(0); controls.setDraft(next); controls.setConfirmed(false); clearFeedback(); };

  return <AdmissionPolicyForm state={state} draft={draft} savedRules={view.savedRules} editing={editing} step={flow.step} confirmed={confirmed} busy={isBusy} stage={flow.stage} pendingAction={flow.pendingAction}
    validationMessage={validationMessage} statusMessage={flow.statusMessage} errorMessage={errorMessage} failure={failure} activationBlock={flow.activationBlock} permissionDenied={flow.permissionDenied} links={view.links}
    pauseOpen={flow.pauseOpen} pauseReason={flow.pauseReason} uncertain={uncertain} canRetryOriginal={canRetry && fresh} retryConfirmed={flow.retryConfirmed}
    finalLabel={publishing && state.policy && !editing ? ADMISSION_POLICY_DRAFT_COPY.activateNow : undefined} platformBlocked={view.platformBlocked} rechecking={flow.rechecking}
    onReviewDraft={() => { controls.setDraft(createAdmissionPolicyDraft(state)); controls.setConfirmed(false); setPublishing(true); controls.setStep(view.stepIds.length - 1); controls.setErrorMessage(null); controls.setStatusMessage(null); controls.setFailure(null); }}
    onRecheck={() => { if (!controls.busy.current && writesOpen) startPolicyRecheck(session); }}
    onChange={(next) => { controls.setDraft(next); controls.setConfirmed(false); setPublishing(false); clearFeedback(); }}
    onStepChange={controls.setStep} onConfirm={controls.setConfirmed} onRunFinal={() => runFinal()}
    onEdit={() => { controls.setEditing(true); controls.setPauseOpen(false); restart(createAdmissionPolicyDraft(state)); }}
    onCancelEdit={() => { controls.setEditing(false); restart(createAdmissionPolicyDraft(state)); }}
    onPauseOpen={(open) => { controls.setPauseOpen(open); if (!open) controls.setPauseReason(""); }} onPauseReason={controls.setPauseReason} onPause={() => pause()} onResume={() => resume()}
    onRetry={retry} onReloadCurrent={launchRead} onRetryConfirm={controls.setRetryConfirmed} onRetryOriginal={retryOriginal} />;
}

/** Render facts of the rules form derived from the current state. */
type PolicyFormViewInput = { ready: PolicyReady; state: AdmissionPolicyStateDto; draft: AdmissionPolicyDraft; editing: boolean; activationBlock: AdmissionPolicyActivationBlock | null };

/** @param input - Current state, draft and requirements block. @returns Saved rules, settings links, the step ids of the flow and whether only the platform can unblock it. */
function policyFormView({ ready, state, draft, editing, activationBlock }: PolicyFormViewInput) {
  const routeBase = `/${encodeURIComponent(ready.slug)}`;
  /** Before activation, channel and quota pages offer the way back to the final step. */
  const returning = (path: string) => state.controlActivated ? path : withPolicyReviewReturn(path);
  const links = { usage: returning(`${routeBase}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`), connection: returning(`${routeBase}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`), allowlist: `${routeBase}/${ALLOWLIST_SETTINGS_SEGMENT}`, academy: ROUTES.tribes.academyManage(ready.slug) };
  const currentReasons = blockReasons(activationBlock);
  return { savedRules: state.policy ? createAdmissionPolicyDraft(state) : draft, links, stepIds: admissionPolicyStepIds(editing), platformBlocked: currentReasons.some(isAdmissionPolicyPlatformReason) };
}
