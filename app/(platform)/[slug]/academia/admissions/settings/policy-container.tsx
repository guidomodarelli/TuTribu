"use client";
/** Owns current viewer checks, the chained rules writes and original policy reconciliation; the presenter has no transport. @module admission-policy-container */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@golfo/ui";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyMutationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/application/results/admission-errors";
import type { AdmissionPolicyActivationReason } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";
import { createAdmissionPolicyDraft, validateAdmissionPolicyBrowserDraft, admissionPolicyBrowserIntentSchema, admissionPolicyDraftSchema, type AdmissionPolicyBrowserIntent } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import { AdmissionPolicyForm, type AdmissionPolicyActivationBlock, type AdmissionPolicyFailure } from "@/components/academy-admissions/admission-policy-form";
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { admissionApiClient } from "@/lib/academy-admissions/admission-api-client";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_POLICY_BROWSER_PHASE as PHASE, ADMISSION_POLICY_BROWSER_COPY as COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_ACTION, ADMISSION_POLICY_FLOW_STAGE as STAGE, ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS, type AdmissionPolicyAction, type AdmissionPolicyFlowStage } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_POLICY_OPERATION, ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_CONFIGURATION_ERROR, ADMISSION_POLICY_EDITABLE_FIELDS } from "@/src/modules/academy-admissions/constants/admission-policy";
import { admissionPolicyStateResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import type { AdmissionPolicyPreflightDto } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { CommercialMembershipReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/commercial-membership-review-browser-client";
import type { CommercialMembershipReviewPageState } from "@/src/modules/academy-admissions/application/results/commercial-membership-review-page-state";
import { ADMISSION_POLICY_BLOCK_RESOLUTION, ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON, ADMISSION_POLICY_ENTRY_STEP, ADMISSION_POLICY_STEP, isAdmissionPolicyPlatformReason, type AdmissionPolicyBlockReason, type AdmissionPolicyEntryStep } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_POLICY_DRAFT_COPY, ADMISSION_POLICY_PLATFORM_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { COMMERCIAL_MEMBERSHIP_REVIEW_COPY, commercialMembershipReviewDoneMessage } from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { withPolicyReviewReturn } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import { ROUTES } from "@/src/constants/routes";
import { CommercialMembershipReview } from "@/components/academy-admissions/commercial-membership-review";
import { admissionPolicyStepIds } from "@/components/academy-admissions/admission-policy-form";
import { useCommercialMembershipReview } from "./use-commercial-membership-review";

/** Only application props and own ports enter the workflow; no SDK identity is serialized. */
type PolicyContainerProps = {
  initialState: AdmissionPolicyPageState; client?: AdmissionPolicyBrowserClient;
  /** Server-read review of memberships blocked by payment; absent where the page does not load it. */
  initialCommercialReview?: CommercialMembershipReviewPageState;
  /** Server-read informational preflight of a saved, not activated draft; null when it could not be read. */
  initialPreflight?: AdmissionPolicyPreflightDto | null;
  /** Allowlisted step opened by a link (guide, return from another settings page). */
  entryStep?: AdmissionPolicyEntryStep | null;
  reviewClient?: CommercialMembershipReviewBrowserClient;
};
type PolicyPhase = typeof PHASE[keyof typeof PHASE];
/** How one write of a chain ended: a definitive failure is retryable, an uncertain one waits for its original. */
type WriteOutcome = "completed" | "failed" | "uncertain" | "stopped";
type WriteResult = { outcome: WriteOutcome; code?: AdmissionErrorCode };
const WRITE_OUTCOME = { completed: "completed", failed: "failed", uncertain: "uncertain", stopped: "stopped" } as const satisfies Record<string, WriteOutcome>;
/** Which requirement explanation follows a denied activation or resume. */
type BlockedAction = "activation" | "resume";

/** @param state - Safe current state. @returns The editable draft; a first configuration starts receiving requests by default. */
function createInitialDraft(state: AdmissionPolicyStateDto): AdmissionPolicyDraft {
  const draft = createAdmissionPolicyDraft(state);
  return state.policy ? draft : { ...draft, isOpen: true };
}

/** @param draft - Proposed rules. @param state - Current state. @returns Whether saving the draft would change the stored configuration. */
function differsFromSaved(draft: AdmissionPolicyDraft, state: AdmissionPolicyStateDto): boolean {
  if (!state.policy) return true;
  const saved = createAdmissionPolicyDraft(state);
  return ADMISSION_POLICY_EDITABLE_FIELDS.some((field) => draft[field] !== saved[field]);
}

/** @param state - Freshly read state. @returns Requirements the leader still has to resolve, without the ones the flow resolves itself. */
function pendingRequirements(state: AdmissionPolicyStateDto): AdmissionPolicyActivationReason[] {
  return [...new Set([...state.preparation.requirements, ...(state.policy?.requirements ?? [])])].filter((requirement) => !ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS.includes(requirement));
}

/** @param reasons - Reasons of a block. @returns Whether any of them is resolved in the membership review. */
function hasCommercialReason(reasons: readonly AdmissionPolicyBlockReason[]): boolean {
  return reasons.some((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] === ADMISSION_POLICY_BLOCK_RESOLUTION.commercialReview);
}
/** @param block - Current block. @returns Its reasons that still need work, without the ones the flow resolves itself. */
function blockReasons(block: AdmissionPolicyActivationBlock | null): AdmissionPolicyBlockReason[] {
  return block ? [...block.preflightReasons, ...block.requirements].filter((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] !== ADMISSION_POLICY_BLOCK_RESOLUTION.selfResolved) : [];
}
/** @param preflight - Informational preflight. @returns A requirements block for an unprepared draft, or null. */
function preflightBlock(preflight: AdmissionPolicyPreflightDto | null | undefined): AdmissionPolicyActivationBlock | null {
  if (!preflight || preflight.prepared) return null;
  const block = { message: COPY.activationIneligible, note: COPY.activationBlockedNote, preflightReasons: preflight.reasons, requirements: [], ...preflight.impact };
  return blockReasons(block).length ? block : null;
}

/** @param props - Safe SSR state and an optional own transport port. @returns A current account-scoped guided flow that retains draft/UUID through conflict and uncertainty. */
export function AdmissionPolicyContainer({ initialState, client = admissionApiClient, initialCommercialReview, initialPreflight, entryStep = null, reviewClient = admissionApiClient }: PolicyContainerProps) {
  const ready = initialState.kind === "ready" ? initialState : null;
  const savedDraft = Boolean(ready?.policy.policy) && !ready?.policy.controlActivated;
  const initialReviewList = initialCommercialReview?.kind === "ready" ? initialCommercialReview.list : null;
  const initialMemberships = savedDraft && (initialReviewList?.pendingCount ?? 0) > 0;
  const initialStepIds = admissionPolicyStepIds(false, initialMemberships);
  const initialStep = savedDraft && entryStep ? initialStepIds.indexOf(entryStep === ADMISSION_POLICY_ENTRY_STEP.memberships && initialMemberships ? ADMISSION_POLICY_STEP.memberships : ADMISSION_POLICY_STEP.review) : 0;
  const [state, setState] = useState(ready?.policy ?? null);
  const [draft, setDraft] = useState<AdmissionPolicyDraft | null>(ready ? createInitialDraft(ready.policy) : null);
  const [phase, setPhase] = useState<PolicyPhase>(PHASE.checking);
  const [step, setStep] = useState(initialStep), [editing, setEditing] = useState(false);
  /** True while saved rules are being published from the draft notice, a return link or the membership review. */
  const [publishing, setPublishing] = useState(savedDraft && entryStep !== null);
  const [rechecking, setRechecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [retryConfirmed, setRetryConfirmed] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false), [pauseReason, setPauseReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null), [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<AdmissionPolicyFailure | null>(null), [activationBlock, setActivationBlock] = useState<AdmissionPolicyActivationBlock | null>(savedDraft ? preflightBlock(initialPreflight) : null);
  const [stage, setStage] = useState<AdmissionPolicyFlowStage | null>(null), [pendingAction, setPendingAction] = useState<AdmissionPolicyAction | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [fresh, setFresh] = useState(false), [canRetry, setCanRetry] = useState(false);
  const [privateVisible, setPrivateVisible] = useState(true);
  const stateRef = useRef(state), freshRef = useRef(false);
  const pending = useRef<AdmissionPolicyBrowserIntent | null>(null), loaded = useRef(false), busy = useRef(false);
  const mounted = useRef(false);
  /** Final index of the flow with the membership review step; the review step only exists before activation. */
  const finalStepWithMemberships = admissionPolicyStepIds(false, true).length - 1;
  const review = useCommercialMembershipReview({
    slug: ready?.slug ?? "", viewerId: ready?.viewerId ?? "", client: reviewClient, initialList: initialReviewList,
    initialError: initialCommercialReview?.kind === "unavailable" ? initialCommercialReview.message : null,
    onAllResolved: useCallback(() => {
      setActivationBlock((current) => {
        if (!current) return null;
        const next = { ...current, preflightReasons: current.preflightReasons.filter((reason) => !hasCommercialReason([reason])), unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 };
        return blockReasons(next).length ? next : null;
      });
      setPublishing(true); setStep(finalStepWithMemberships); setErrorMessage(null);
      setStatusMessage(commercialMembershipReviewDoneMessage(ADMISSION_POLICY_DRAFT_COPY.activateNow));
    }, [finalStepWithMemberships]),
  });
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);

  /** Keeps the chained writes on the latest confirmed state instead of a render closure. */
  const commitState = useCallback((next: AdmissionPolicyStateDto) => { stateRef.current = next; setState(next); }, []);
  /** Records whether the shown configuration is known to be current for this viewer. */
  const markFresh = useCallback((value: boolean) => { freshRef.current = value; setFresh(value); }, []);
  /** Only an actual role or permission denial shows the leader-only notice; other failures never do. */
  const noteFailureCode = useCallback((code: AdmissionErrorCode) => { if (code === ADMISSION_ERROR_CODE.permissionDenied) setPermissionDenied(true); }, []);

  /** Checks the native account before reading a local intention or accepting a private response. */
  const checkViewer = useCallback(async (signal: AbortSignal) => {
    if (!ready || signal.aborted) return false;
    const viewer = await client.viewer(signal);
    if (signal.aborted || viewer.status === "aborted") return false;
    if (viewer.status === "failed") { markFresh(false); setPrivateVisible(false); setErrorMessage(viewer.message); return false; }
    if (viewer.value?.id !== ready.viewerId) { markFresh(false); setPhase(PHASE.changedViewer); return false; }
    return true;
  }, [ready, client, markFresh]);

  /** Retrieves original identity first; historical results never replace today's configuration. */
  const readCurrent = useCallback(async (signal: AbortSignal, restore = false) => {
    if (!ready || signal.aborted) return;
    setPhase(PHASE.reading); markFresh(false); setConfirmed(false); setRetryConfirmed(false); setCanRetry(false); setFailure(null);
    /** The first restore keeps the server-read requirements; explicit reads start without stale ones. */
    if (!restore) setActivationBlock(null);
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
        else { noteFailureCode(recovery.code); setErrorMessage(recovery.message); return; }
      }
      if (!restore || pending.current || recovered) {
        const current = await client.readPolicy(ready.slug, signal);
        if (signal.aborted || current.status === "aborted") return;
        if (!await checkViewer(signal)) return;
        if (current.status === "failed") { noteFailureCode(current.code); setErrorMessage(current.message); return; }
        commitState(current.value);
      }
      markFresh(true); setPrivateVisible(true); setPermissionDenied(false);
    } catch { if (!signal.aborted) setErrorMessage(COPY.storageFailed); }
    finally { if (!signal.aborted) setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
  }, [ready, client, checkViewer, commitState, markFresh, noteFailureCode]);

  /** Explicit reads use one cancellable slot and cannot replace an in-flight write. */
  const launchRead = useCallback(() => {
    if (busy.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setErrorMessage(null); void readCurrent(controller.signal);
  }, [readCurrent]);

  useEffect(() => {
    const controller = new AbortController(); readController.current = controller;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      const initial = !mounted.current; mounted.current = true;
      if (!initial) { setPrivateVisible(false); markFresh(false); setConfirmed(false); }
      return readCurrent(controller.signal, initial);
    });
    /** Activity/bfcache restoration must reload the original intention before any new write. */
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setPrivateVisible(false); markFresh(false); setConfirmed(false); writeController.current?.abort(); busy.current = false; loaded.current = false; launchRead(); } };
    window.addEventListener("pageshow", restored);
    return () => { controller.abort(); readController.current?.abort(); writeController.current?.abort(); loaded.current = false; busy.current = false; window.removeEventListener("pageshow", restored); };
  }, [readCurrent, launchRead, markFresh]);

  /** Applies only a new confirmed minimal response at the observed current version; a first creation keeps the leader's draft. */
  const applyResult = (intent: AdmissionPolicyBrowserIntent, result: AdmissionPolicyMutationResult) => {
    const current = stateRef.current;
    if (!ready || !current || result.policyId !== ready.tribeId) throw new Error("AdmissionPolicyContainer:applyResult policy owner mismatch");
    if (intent.type !== ADMISSION_POLICY_OPERATION.initialize && (!current.policy || current.policy.version !== intent.input.expectedVersion || result.version !== intent.input.expectedVersion + (result.changed ? 1 : 0))) throw new Error("AdmissionPolicyContainer:applyResult policy counter mismatch");
    const changes = intent.type === ADMISSION_POLICY_OPERATION.update ? intent.input : intent.type === ADMISSION_POLICY_OPERATION.pause ? { isOpen: false } : {};
    /** A created policy starts from the server defaults, never from the unsaved draft. */
    const base = current.policy ?? { ...createAdmissionPolicyDraft(current), id: result.policyId, usage: current.usage, requirements: [] };
    const policy = { ...base, ...changes, version: result.version, verificationEpoch: result.verificationEpoch, activatedAt: result.activatedAt };
    const next = { ...current, policy, controlActivated: result.controlActivated, state: result.controlActivated ? policy.isOpen ? ADMISSION_POLICY_PUBLIC_STATE.active : ADMISSION_POLICY_PUBLIC_STATE.paused : ADMISSION_POLICY_PUBLIC_STATE.draft,
      impact: { ...current.impact, contactTypeLocked: result.controlActivated, historicalLinksProtected: result.controlActivated } };
    const guarded = admissionPolicyStateResultSchema.parse(next);
    commitState(guarded);
    /** Pausing also closes the draft, so a later save never reopens admissions silently. */
    if (intent.type !== ADMISSION_POLICY_OPERATION.initialize) setDraft(createAdmissionPolicyDraft(guarded));
  };

  /** Persists before transport; uncertain/aborted writes retain their exact original UUID and payload. */
  const sendIntent = async (intent: AdmissionPolicyBrowserIntent, signal: AbortSignal): Promise<WriteResult> => {
    if (!ready || !await checkViewer(signal)) return { outcome: WRITE_OUTCOME.stopped };
    writeAdmissionPolicyIntent(ready.viewerId, ready.slug, intent); pending.current = intent; markFresh(false);
    const result = intent.type === ADMISSION_POLICY_OPERATION.initialize ? await client.initializePolicy(ready.slug, intent.input, signal)
      : intent.type === ADMISSION_POLICY_OPERATION.update ? await client.updatePolicy(ready.slug, intent.input, signal)
      : intent.type === ADMISSION_POLICY_OPERATION.activate ? await client.activatePolicy(ready.slug, intent.input, signal)
      : await client.pausePolicy(ready.slug, intent.input, signal);
    if (signal.aborted || result.status === "aborted") return { outcome: WRITE_OUTCOME.stopped };
    if (!await checkViewer(signal)) return { outcome: WRITE_OUTCOME.stopped };
    if (result.status === "failed") {
      noteFailureCode(result.code); setErrorMessage(result.message);
      /** A legacy session-change answer keeps the original intent so reloading can still recover it. */
      if (result.uncertain || result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) return { outcome: WRITE_OUTCOME.uncertain, code: result.code };
      writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); pending.current = null;
      return { outcome: WRITE_OUTCOME.failed, code: result.code };
    }
    if (result.value.state === "started" || result.value.operationId !== intent.input.operationId) { setErrorMessage(COPY.uncertain); return { outcome: WRITE_OUTCOME.uncertain }; }
    applyResult(intent, result.value.result);
    writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); pending.current = null; markFresh(true);
    return { outcome: WRITE_OUTCOME.completed };
  };

  /** Runs one write chain in the single write slot; only the pressed button shows its loading state. */
  const runWrite = async (action: AdmissionPolicyAction, work: (signal: AbortSignal) => Promise<void>) => {
    if (!ready || busy.current) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); writeController.current = controller;
    setPhase(PHASE.writing); setPendingAction(action); setStatusMessage(null); setActivationBlock(null);
    /** A retry keeps its failure on screen until a new outcome replaces it, so its button keeps the focus. */
    if (action !== ADMISSION_POLICY_ACTION.retry) { setErrorMessage(null); setFailure(null); }
    try { await work(controller.signal); }
    catch { if (!controller.signal.aborted) { setFailure(null); setErrorMessage(COPY.storageFailed); } }
    finally {
      if (writeController.current === controller) busy.current = false;
      if (!controller.signal.aborted) { setStage(null); setPendingAction(null); setCanRetry(false); setPhase((current) => current === PHASE.changedViewer ? current : pending.current ? PHASE.uncertain : PHASE.idle); }
    }
  };

  /** Announces a confirmed action with its own message, in the page and as a toast. */
  const succeed = (message: string) => { setErrorMessage(null); setFailure(null); setStatusMessage(message); toast.success(message); };
  /** A definitive failure offers a retry from its sub-step; an uncertain one is recovered through its original. */
  const reportFailure = (failedStage: AdmissionPolicyFlowStage, rulesSaved: boolean, result: WriteResult) => setFailure(result.outcome === WRITE_OUTCOME.failed ? { stage: failedStage, rulesSaved } : null);

  /** @param type - Operation. @param extra - Proposed settings or pause reason. @returns A validated new intent with a fresh UUID at the latest observed version, or null. */
  const buildIntent = (type: AdmissionPolicyBrowserIntent["type"], extra: Partial<AdmissionPolicyDraft> & { reason?: string } = {}) => {
    const input = { operationId: newAdmissionOperationId(), confirmed: true, ...(type === ADMISSION_POLICY_OPERATION.initialize ? {} : { expectedVersion: stateRef.current?.policy?.version }), ...extra };
    const parsed = admissionPolicyBrowserIntentSchema.safeParse({ type, input });
    if (!parsed.success) { setFailure(null); setErrorMessage(COPY.invalid); return null; }
    return parsed.data;
  };

  /** A write after a failed one first rereads the configuration; a version changed by someone else needs a new confirmation. */
  const refreshBeforeWrite = async (signal: AbortSignal): Promise<WriteResult> => {
    if (!ready || freshRef.current) return { outcome: WRITE_OUTCOME.completed };
    const before = stateRef.current?.policy?.version ?? null;
    if (!await checkViewer(signal)) return { outcome: WRITE_OUTCOME.stopped };
    const current = await client.readPolicy(ready.slug, signal);
    if (signal.aborted || current.status === "aborted" || !await checkViewer(signal)) return { outcome: WRITE_OUTCOME.stopped };
    if (current.status === "failed") { noteFailureCode(current.code); setErrorMessage(current.message); return { outcome: WRITE_OUTCOME.failed, code: current.code }; }
    commitState(current.value); markFresh(true);
    if ((current.value.policy?.version ?? null) === before) return { outcome: WRITE_OUTCOME.completed };
    setConfirmed(false); setFailure(null); setErrorMessage(COPY.changedMeanwhile);
    return { outcome: WRITE_OUTCOME.stopped };
  };

  /** Rereads the configuration after a denied activation or resume and lists what the leader still has to resolve. */
  const showRequirements = async (signal: AbortSignal, blocked: BlockedAction) => {
    if (!ready) return;
    const current = await client.readPolicy(ready.slug, signal);
    if (signal.aborted || current.status === "aborted" || !await checkViewer(signal)) return;
    if (current.status === "ready") { commitState(current.value); markFresh(true); }
    setErrorMessage(null); setFailure(null);
    setActivationBlock({ message: blocked === "activation" ? COPY.activationIneligible : COPY.resumeIneligible, note: blocked === "activation" ? COPY.activationBlockedNote : COPY.resumeBlockedNote,
      preflightReasons: [], requirements: current.status === "ready" ? pendingRequirements(current.value) : [], unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 });
  };

  if (!ready || !state || !draft) return <AdmissionRouteError embedded message={initialState.kind === "unavailable" ? initialState.message : COPY.storageFailed} reset={() => window.location.reload()} />;
  if (phase === PHASE.changedViewer) return <AdmissionRouteError embedded message={COPY.changedViewer} reset={() => window.location.reload()} />;
  if (!privateVisible && (phase === PHASE.checking || phase === PHASE.reading)) return <p role="status">{COPY.reading}</p>;
  if (!privateVisible) return <AdmissionRouteError embedded message={errorMessage ?? COPY.storageFailed} reset={launchRead} />;
  const reason = validateAdmissionPolicyBrowserDraft(draft, state);
  const validationMessage = reason === ADMISSION_POLICY_CONFIGURATION_ERROR.contactTypeLocked ? COPY.contactLocked : reason === ADMISSION_POLICY_CONFIGURATION_ERROR.phoneAllowlistVerificationRequired ? COPY.phoneAllowlist : reason === ADMISSION_POLICY_CONFIGURATION_ERROR.smsAlternativeInvalid ? COPY.smsAlternative : reason ? COPY.invalid : null;
  const uncertain = phase === PHASE.uncertain;
  const isBusy = phase === PHASE.checking || phase === PHASE.reading || phase === PHASE.writing;
  const unavailable = state.state === ADMISSION_POLICY_PUBLIC_STATE.unavailable;
  const savedRules = state.policy ? createAdmissionPolicyDraft(state) : draft;
  const routeBase = `/${encodeURIComponent(ready.slug)}`;
  /** Before activation, channel and quota pages offer the way back to the final step. */
  const returning = (path: string) => state.controlActivated ? path : withPolicyReviewReturn(path);
  const links = { usage: returning(`${routeBase}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`), connection: returning(`${routeBase}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`), allowlist: `${routeBase}/${ALLOWLIST_SETTINGS_SEGMENT}`, academy: ROUTES.tribes.academyManage(ready.slug) };
  const currentReasons = blockReasons(activationBlock);
  const platformBlocked = currentReasons.some(isAdmissionPolicyPlatformReason);
  /** The membership review joins the flow while memberships wait for a decision or were just decided. */
  const membershipsVisible = !state.controlActivated && !editing && ((review.list?.pendingCount ?? 0) > 0 || review.resolvedThisSession > 0 || hasCommercialReason(currentReasons));
  const stepIds = admissionPolicyStepIds(editing, membershipsVisible);
  const membershipStep = membershipsVisible ? {
    blockedReason: (review.list?.pendingCount ?? 0) > 0 || review.phase === "failed" ? COMMERCIAL_MEMBERSHIP_REVIEW_COPY.pendingBlocked : null,
    content: <CommercialMembershipReview phase={review.phase} list={review.list} drafts={review.drafts} pendingMemberId={review.pendingMemberId} busy={review.busy || isBusy} uncertain={review.uncertain}
      statusMessage={review.statusMessage} errorMessage={review.errorMessage} doneMessage={commercialMembershipReviewDoneMessage(ADMISSION_POLICY_DRAFT_COPY.activateNow)}
      onDraftChange={review.setDraft} onResolve={review.resolve} onReload={review.reload} onReadOriginal={review.readOriginal} />,
  } : null;
  /** New writes stay closed while an original is unresolved or the configuration needs authorized review. */
  const writesOpen = !isBusy && !uncertain && !unavailable;

  /** Guardar y activar / Guardar cambios: creates the policy if missing, saves the rules, checks requirements and activates, stopping where something fails. */
  const runFinal = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.final) => {
    if (!writesOpen || pending.current || !confirmed || validationMessage) return;
    const proposed = draft, activating = !editing, previousFailure = failure;
    void runWrite(action, async (signal) => {
      setStage(previousFailure?.stage ?? STAGE.saving);
      const refreshed = await refreshBeforeWrite(signal);
      /** A reread that fails keeps describing the sub-step being retried and what was already saved. */
      if (refreshed.outcome !== WRITE_OUTCOME.completed) { reportFailure(previousFailure?.stage ?? STAGE.saving, previousFailure?.rulesSaved ?? false, refreshed); return; }
      setStage(STAGE.saving);
      let created = false;
      if (!stateRef.current?.policy) {
        const intent = buildIntent(ADMISSION_POLICY_OPERATION.initialize); if (!intent) return;
        const result = await sendIntent(intent, signal);
        if (result.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.saving, false, result); return; }
        created = true;
      }
      if (created || (stateRef.current && differsFromSaved(proposed, stateRef.current))) {
        const intent = buildIntent(ADMISSION_POLICY_OPERATION.update, proposed); if (!intent) return;
        const result = await sendIntent(intent, signal);
        if (result.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.saving, false, result); return; }
      }
      if (!activating || stateRef.current?.controlActivated) { setConfirmed(false); setEditing(false); setStep(0); succeed(COPY.rulesSaved); return; }
      setStage(STAGE.checking);
      if (!await checkViewer(signal)) return;
      const preflight = await client.readPreflight(ready.slug, signal);
      if (signal.aborted || preflight.status === "aborted" || !await checkViewer(signal)) return;
      if (preflight.status === "failed") { noteFailureCode(preflight.code); setErrorMessage(preflight.message); setFailure({ stage: STAGE.checking, rulesSaved: true }); return; }
      if (!preflight.value.prepared) {
        setErrorMessage(null); setFailure(null);
        setActivationBlock({ message: COPY.activationIneligible, note: COPY.activationBlockedNote, preflightReasons: preflight.value.reasons, requirements: [], ...preflight.value.impact });
        /** Memberships blocked by payment are decided in their own step, inserted just before the final one. */
        if (hasCommercialReason(preflight.value.reasons)) { setStep(admissionPolicyStepIds(false, true).indexOf(ADMISSION_POLICY_STEP.memberships)); review.reload(); }
        return;
      }
      setStage(STAGE.activating);
      const intent = buildIntent(ADMISSION_POLICY_OPERATION.activate); if (!intent) return;
      const result = await sendIntent(intent, signal);
      if (result.outcome === WRITE_OUTCOME.failed && result.code === ADMISSION_ERROR_CODE.admissionIneligible) { await showRequirements(signal, "activation"); return; }
      if (result.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.activating, true, result); return; }
      setConfirmed(false); setStep(0);
      succeed(stateRef.current?.policy?.isOpen ? COPY.activatedOpen : COPY.activatedPaused);
    });
  };

  /** Closes new requests with the reason the contract requires; the saved draft closes too. */
  const pause = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.pause) => {
    if (!writesOpen || pending.current || !pauseReason.trim()) return;
    void runWrite(action, async (signal) => {
      setStage(STAGE.pausing);
      const refreshed = await refreshBeforeWrite(signal);
      if (refreshed.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.pausing, false, refreshed); return; }
      const intent = buildIntent(ADMISSION_POLICY_OPERATION.pause, { reason: pauseReason }); if (!intent) return;
      const result = await sendIntent(intent, signal);
      if (result.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.pausing, false, result); return; }
      setPauseOpen(false); setPauseReason(""); succeed(COPY.paused);
    });
  };

  /** Reopens new requests by saving the current rules with intake enabled; the server rechecks readiness. */
  const resume = (action: AdmissionPolicyAction = ADMISSION_POLICY_ACTION.resume) => {
    if (!writesOpen || pending.current) return;
    void runWrite(action, async (signal) => {
      setStage(STAGE.resuming);
      const refreshed = await refreshBeforeWrite(signal);
      if (refreshed.outcome !== WRITE_OUTCOME.completed || !stateRef.current) { reportFailure(STAGE.resuming, false, refreshed); return; }
      const intent = buildIntent(ADMISSION_POLICY_OPERATION.update, { ...createAdmissionPolicyDraft(stateRef.current), isOpen: true }); if (!intent) return;
      const result = await sendIntent(intent, signal);
      if (result.outcome === WRITE_OUTCOME.failed && result.code === ADMISSION_ERROR_CODE.admissionIneligible) { await showRequirements(signal, "resume"); return; }
      if (result.outcome !== WRITE_OUTCOME.completed) { reportFailure(STAGE.resuming, false, result); return; }
      succeed(COPY.resumed);
    });
  };

  /** Retries the failed sub-step with a new operation; completed sub-steps are skipped because the state already reflects them. */
  const retry = () => {
    if (failure?.stage === STAGE.pausing) pause(ADMISSION_POLICY_ACTION.retry);
    else if (failure?.stage === STAGE.resuming) resume(ADMISSION_POLICY_ACTION.retry);
    else runFinal(ADMISSION_POLICY_ACTION.retry);
  };

  /** Resends the exact original payload and UUID only after it was confirmed absent and the viewer confirmed again. */
  const retryOriginal = () => {
    const intent = pending.current;
    if (!intent || !canRetry || !fresh || !retryConfirmed || isBusy) return;
    void runWrite(ADMISSION_POLICY_ACTION.original, async (signal) => {
      setStage(STAGE.retrying);
      const result = await sendIntent(intent, signal);
      setRetryConfirmed(false);
      if (result.outcome === WRITE_OUTCOME.completed) succeed(COPY.recovered);
    });
  };

  /** Clears feedback that described the previous draft. */
  const clearFeedback = () => { setErrorMessage(null); setStatusMessage(null); setFailure(null); setActivationBlock(null); };

  /** Volver a comprobar: rereads the configuration and the requirements, without writing or asking for another decision. */
  const recheck = () => {
    if (busy.current || !writesOpen) return;
    busy.current = true; readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setRechecking(true); setStatusMessage(null); setErrorMessage(null);
    void (async () => {
      try {
        if (!await checkViewer(controller.signal)) return;
        const current = await client.readPolicy(ready.slug, controller.signal);
        if (controller.signal.aborted || current.status === "aborted" || !await checkViewer(controller.signal)) return;
        if (current.status === "failed") { noteFailureCode(current.code); setErrorMessage(current.message); return; }
        commitState(current.value); markFresh(true);
        const requirements = pendingRequirements(current.value);
        const preflight = current.value.controlActivated ? null : await client.readPreflight(ready.slug, controller.signal);
        if (controller.signal.aborted || preflight?.status === "aborted" || !await checkViewer(controller.signal)) return;
        if (preflight?.status === "failed") { noteFailureCode(preflight.code); setErrorMessage(preflight.message); return; }
        const preflightValue = preflight?.status === "ready" ? preflight.value : null;
        const next = { message: current.value.controlActivated ? COPY.resumeIneligible : COPY.activationIneligible, note: current.value.controlActivated ? COPY.resumeBlockedNote : COPY.activationBlockedNote,
          preflightReasons: preflightValue && !preflightValue.prepared ? preflightValue.reasons : [], requirements, unknownCommercialMemberCount: preflightValue?.impact.unknownCommercialMemberCount ?? 0, privilegedCommercialMemberCount: preflightValue?.impact.privilegedCommercialMemberCount ?? 0 };
        if (blockReasons(next).length) { setActivationBlock(next); setStatusMessage(ADMISSION_POLICY_PLATFORM_COPY.rechecked); if (hasCommercialReason(next.preflightReasons)) review.reload(); }
        else { setActivationBlock(null); setStatusMessage(ADMISSION_POLICY_PLATFORM_COPY.recheckedReady); }
      } catch { if (!controller.signal.aborted) setErrorMessage(COPY.storageFailed); }
      finally { if (readController.current === controller) { busy.current = false; setRechecking(false); } }
    })();
  };

  return <AdmissionPolicyForm state={state} draft={draft} savedRules={savedRules} editing={editing} step={step} confirmed={confirmed} busy={isBusy} stage={stage} pendingAction={pendingAction}
    validationMessage={validationMessage} statusMessage={statusMessage} errorMessage={errorMessage} failure={failure} activationBlock={activationBlock} permissionDenied={permissionDenied} links={links}
    pauseOpen={pauseOpen} pauseReason={pauseReason} uncertain={uncertain} canRetryOriginal={canRetry && fresh} retryConfirmed={retryConfirmed}
    membershipStep={membershipStep} finalLabel={publishing && state.policy && !editing ? ADMISSION_POLICY_DRAFT_COPY.activateNow : undefined} platformBlocked={platformBlocked} rechecking={rechecking}
    onReviewDraft={() => { setDraft(createAdmissionPolicyDraft(state)); setConfirmed(false); setPublishing(true); setStep(stepIds.length - 1); setErrorMessage(null); setStatusMessage(null); setFailure(null); }}
    onReviewCommercial={membershipsVisible ? () => setStep(stepIds.indexOf(ADMISSION_POLICY_STEP.memberships)) : undefined} onRecheck={recheck}
    onChange={(next) => { setDraft(next); setConfirmed(false); setPublishing(false); clearFeedback(); }}
    onStepChange={setStep} onConfirm={setConfirmed} onRunFinal={() => runFinal()}
    onEdit={() => { setEditing(true); setStep(0); setDraft(createAdmissionPolicyDraft(state)); setConfirmed(false); setPauseOpen(false); clearFeedback(); }}
    onCancelEdit={() => { setEditing(false); setStep(0); setDraft(createAdmissionPolicyDraft(state)); setConfirmed(false); clearFeedback(); }}
    onPauseOpen={(open) => { setPauseOpen(open); if (!open) setPauseReason(""); }} onPauseReason={setPauseReason} onPause={() => pause()} onResume={() => resume()}
    onRetry={retry} onReloadCurrent={launchRead} onRetryConfirm={setRetryConfirmed} onRetryOriginal={retryOriginal} />;
}
