/** Reads, recovers and writes the admission rules for the policy container, through its stable state controls. @module admission-policy-workflow */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "@golfo/ui";
import type { AdmissionPolicyPageState } from "@/src/modules/academy-admissions/application/results/admission-policy-page-state";
import type { AdmissionPolicyBrowserClient, AdmissionPolicyPreflightDto } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import type { AdmissionPolicyMutationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-policy-management";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import { type AdmissionPolicyStateDto, admissionPolicyStateResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/application/results/admission-errors";
import type { AdmissionPolicyActivationReason } from "@/src/modules/academy-admissions/domain/policies/admission-policy-activation";
import { createAdmissionPolicyDraft, admissionPolicyBrowserIntentSchema, admissionPolicyDraftSchema, type AdmissionPolicyBrowserIntent, type validateAdmissionPolicyBrowserDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import { type AdmissionPolicyActivationBlock, type AdmissionPolicyFailure, admissionPolicyStepIds } from "@/components/academy-admissions/admission-policy-form";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_POLICY_BROWSER_PHASE as PHASE, ADMISSION_POLICY_BROWSER_COPY as COPY, ADMISSION_POLICY_PLATFORM_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_ACTION, ADMISSION_POLICY_FLOW_STAGE as STAGE, ADMISSION_POLICY_PREFLIGHT_COVERED_REQUIREMENTS, ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS, type AdmissionPolicyAction, type AdmissionPolicyFlowStage, ADMISSION_POLICY_BLOCK_RESOLUTION, ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON, ADMISSION_POLICY_STEP, type AdmissionPolicyBlockReason } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_POLICY_OPERATION, ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_CONFIGURATION_ERROR, ADMISSION_POLICY_RULE_FIELDS } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Browser phase of the rules flow. */
export type PolicyPhase = typeof PHASE[keyof typeof PHASE];
/** Server snapshot of a rules route the viewer may manage. */
export type PolicyReady = Extract<AdmissionPolicyPageState, { kind: "ready" }>;
/** How one write of a chain ended: a definitive failure is retryable, an uncertain one waits for its original. */
type WriteOutcome = "completed" | "failed" | "uncertain" | "stopped";
type WriteResult = { outcome: WriteOutcome; code?: AdmissionErrorCode };
const WRITE_OUTCOME = { completed: "completed", failed: "failed", uncertain: "uncertain", stopped: "stopped" } as const satisfies Record<string, WriteOutcome>;
/** Which requirement explanation follows a denied activation, resume or save of active rules. */
type BlockedAction = "activation" | "resume" | "save";
/** Message and next step shown with the requirements of each denied action. */
const BLOCKED_ACTION_COPY = {
  activation: { message: COPY.activationIneligible, note: COPY.activationBlockedNote },
  resume: { message: COPY.resumeIneligible, note: COPY.resumeBlockedNote },
  save: { message: COPY.saveIneligible, note: COPY.saveBlockedNote },
} as const satisfies Record<BlockedAction, { message: string; note: string }>;
/** Whether a recovery consultation stops the read, recovered the original or lets the read continue. */
type PolicyRecoveryOutcome = "stop" | "recovered" | "continue";

/** Stable setters and refs of the policy container; their identity never changes between renders. */
export type PolicyControls = {
  setState: (value: AdmissionPolicyStateDto) => void; setDraft: (value: AdmissionPolicyDraft) => void; setPhase: Dispatch<SetStateAction<PolicyPhase>>;
  setStep: (value: number) => void; setEditing: (value: boolean) => void; setRechecking: (value: boolean) => void; setConfirmed: (value: boolean) => void;
  setRetryConfirmed: (value: boolean) => void; setPauseOpen: (value: boolean) => void; setPauseReason: (value: string) => void;
  setErrorMessage: (value: string | null) => void; setStatusMessage: (value: string | null) => void; setFailure: (value: AdmissionPolicyFailure | null) => void;
  setActivationBlock: Dispatch<SetStateAction<AdmissionPolicyActivationBlock | null>>; setStage: (value: AdmissionPolicyFlowStage | null) => void; setPendingAction: (value: AdmissionPolicyAction | null) => void;
  setPermissionDenied: (value: boolean) => void; setFresh: (value: boolean) => void; setCanRetry: (value: boolean) => void; setPrivateVisible: (value: boolean) => void;
  stateRef: RefObject<AdmissionPolicyStateDto | null>; freshRef: RefObject<boolean>; pending: RefObject<AdmissionPolicyBrowserIntent | null>; loaded: RefObject<boolean>; busy: RefObject<boolean>;
  readController: RefObject<AbortController | null>; writeController: RefObject<AbortController | null>;
};
/** Current route snapshot, transport and controls shared by every read and write. */
export type PolicyReadSession = { ready: PolicyReady; client: AdmissionPolicyBrowserClient; controls: PolicyControls };
/** A session that can also reload the membership review after a requirements check. */
export type PolicySession = PolicyReadSession & { reloadReview: () => void };
type RecoveredOperation = Extract<Awaited<ReturnType<AdmissionPolicyBrowserClient["operation"]>>, { status: "ready" }>["value"];

/** @param state - Safe current state. @returns The editable draft; a first configuration starts receiving requests by default. */
export function createInitialDraft(state: AdmissionPolicyStateDto): AdmissionPolicyDraft {
  const draft = createAdmissionPolicyDraft(state);
  return state.policy ? draft : { ...draft, isOpen: true };
}

/** @param draft - Proposed rules. @param state - Current state. @returns Whether saving the draft would change the stored configuration. */
function differsFromSaved(draft: AdmissionPolicyDraft, state: AdmissionPolicyStateDto): boolean {
  if (!state.policy) return true;
  const saved = createAdmissionPolicyDraft(state);
  return ADMISSION_POLICY_RULE_FIELDS.some((field) => draft[field] !== saved[field]);
}

/** @param state - Freshly read state. @returns Requirements the leader still has to resolve, without the ones the flow resolves itself. */
function pendingRequirements(state: AdmissionPolicyStateDto): AdmissionPolicyActivationReason[] {
  return [...new Set([...state.preparation.requirements, ...(state.policy?.requirements ?? [])])].filter((requirement) => !ADMISSION_POLICY_SELF_RESOLVED_REQUIREMENTS.includes(requirement));
}

/** @param reasons - Reasons of a block. @returns Whether any of them is resolved in the membership review. */
export function hasCommercialReason(reasons: readonly AdmissionPolicyBlockReason[]): boolean {
  return reasons.some((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] === ADMISSION_POLICY_BLOCK_RESOLUTION.commercialReview);
}
/** @param block - Current block. @returns Its reasons that still need work, without the ones the flow resolves itself. */
export function blockReasons(block: AdmissionPolicyActivationBlock | null): AdmissionPolicyBlockReason[] {
  return block ? [...block.preflightReasons, ...block.requirements].filter((reason) => ADMISSION_POLICY_BLOCK_RESOLUTION_BY_REASON[reason] !== ADMISSION_POLICY_BLOCK_RESOLUTION.selfResolved) : [];
}
/**
 * @param preflight - Informational preflight.
 * @param state - Current saved policy, whose evaluated requirements (channel, quota, countries) the preflight does not cover.
 * @returns A requirements block for an unprepared saved draft, or null when nothing is missing.
 */
export function draftBlock(preflight: AdmissionPolicyPreflightDto | null | undefined, state: AdmissionPolicyStateDto | null): AdmissionPolicyActivationBlock | null {
  const preflightReasons = preflight && !preflight.prepared ? preflight.reasons : [];
  const impact = preflight && !preflight.prepared ? preflight.impact : { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 };
  const requirements = (state ? pendingRequirements(state) : []).filter((requirement) => !preflight || !ADMISSION_POLICY_PREFLIGHT_COVERED_REQUIREMENTS.includes(requirement));
  const block = { message: COPY.activationIneligible, note: COPY.activationBlockedNote, preflightReasons, requirements, ...impact };
  return blockReasons(block).length ? block : null;
}

/** @param reason - Browser validation outcome of the draft. @returns Its explanation, or null for a valid draft. */
export function policyValidationMessage(reason: ReturnType<typeof validateAdmissionPolicyBrowserDraft>): string | null {
  if (reason === ADMISSION_POLICY_CONFIGURATION_ERROR.contactTypeLocked) return COPY.contactLocked;
  if (reason === ADMISSION_POLICY_CONFIGURATION_ERROR.phoneAllowlistVerificationRequired) return COPY.phoneAllowlist;
  if (reason === ADMISSION_POLICY_CONFIGURATION_ERROR.smsAlternativeInvalid) return COPY.smsAlternative;
  return reason ? COPY.invalid : null;
}

/** @param current - Phase when the work settles. @param pending - Original command still stored, if any. @returns A changed viewer as is; otherwise uncertain while an original is pending, or idle. */
function settledPolicyPhase(current: PolicyPhase, pending: AdmissionPolicyBrowserIntent | null): PolicyPhase {
  if (current === PHASE.changedViewer) return current;
  return pending ? PHASE.uncertain : PHASE.idle;
}

/** Keeps the chained writes on the latest confirmed state instead of a render closure. @param controls - Stable controls. @param next - Confirmed state. @returns Nothing. */
function commitPolicyState(controls: PolicyControls, next: AdmissionPolicyStateDto): void {
  controls.stateRef.current = next; controls.setState(next);
}
/** Records whether the shown configuration is known to be current for this viewer. @param controls - Stable controls. @param value - Whether it is current. @returns Nothing. */
export function markPolicyFresh(controls: PolicyControls, value: boolean): void {
  controls.freshRef.current = value; controls.setFresh(value);
}
/** Only an actual role or permission denial shows the leader-only notice; other failures never do. @param controls - Stable controls. @param code - Failure code. @returns Nothing. */
function notePolicyFailureCode(controls: PolicyControls, code: AdmissionErrorCode): void {
  if (code === ADMISSION_ERROR_CODE.permissionDenied) controls.setPermissionDenied(true);
}
/** @param controls - Stable controls. @param code - Failure code. @param message - Safe message. @returns Nothing after showing the failure. */
function showPolicyFailure(controls: PolicyControls, code: AdmissionErrorCode, message: string): void {
  notePolicyFailureCode(controls, code); controls.setErrorMessage(message);
}

/** Checks the native account before reading a local intention or accepting a private response. @param session - Current route session. @param signal - Signal of the work. @returns Whether the same viewer is still current. */
async function checkPolicyViewer({ ready, client, controls }: PolicyReadSession, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const viewer = await client.viewer(signal);
  if (signal.aborted || viewer.status === "aborted") return false;
  if (viewer.status === "failed") { markPolicyFresh(controls, false); controls.setPrivateVisible(false); controls.setErrorMessage(viewer.message); return false; }
  if (viewer.value?.id !== ready.viewerId) { markPolicyFresh(controls, false); controls.setPhase(PHASE.changedViewer); return false; }
  return true;
}

/** @param session - Current route session. @returns Nothing after loading the stored original once and restoring a stored update as the draft. */
function restorePolicyIntent({ ready, controls }: PolicyReadSession): void {
  if (controls.loaded.current) return;
  controls.pending.current = readAdmissionPolicyIntent(ready.viewerId, ready.slug); controls.loaded.current = true;
  if (controls.pending.current?.type !== ADMISSION_POLICY_OPERATION.update) return;
  const { operationId: _operationId, confirmed: _confirmed, expectedVersion: _expectedVersion, ...restoredDraft } = controls.pending.current.input;
  controls.setDraft(admissionPolicyDraftSchema.parse(restoredDraft));
}

/** @param original - Recovered operation. @param intent - Stored original. @param tribeId - Current tribe. @returns Whether it is the completed original of this tribe's policy. */
function isRecoveredOriginal(original: RecoveredOperation, intent: AdmissionPolicyBrowserIntent, tribeId: string): boolean {
  if (original.operationId !== intent.input.operationId || original.type !== intent.type || original.state !== "completed") return false;
  return "policyId" in original.result && original.result.policyId === tribeId;
}

/** @param session - Current route session. @param intent - Stored original. @param signal - Current read. @returns Whether the read stops, recovered the original or continues. */
async function recoverPolicyOriginal(session: PolicyReadSession, intent: AdmissionPolicyBrowserIntent, signal: AbortSignal): Promise<PolicyRecoveryOutcome> {
  const { ready, client, controls } = session;
  const recovery = await client.operation(ready.slug, intent.input.operationId, signal);
  if (signal.aborted || recovery.status === "aborted") return "stop";
  if (!await checkPolicyViewer(session, signal)) return "stop";
  if (recovery.status === "ready") {
    if (!isRecoveredOriginal(recovery.value, intent, ready.tribeId)) { controls.setErrorMessage(COPY.uncertain); return "stop"; }
    if (!await checkPolicyViewer(session, signal)) return "stop";
    writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); controls.pending.current = null; controls.setStatusMessage(COPY.recovered);
    return "recovered";
  }
  if (recovery.code === ADMISSION_ERROR_CODE.resourceUnavailable) { controls.setCanRetry(true); controls.setErrorMessage(COPY.retry); return "continue"; }
  showPolicyFailure(controls, recovery.code, recovery.message);
  return "stop";
}

/** @param session - Current route session. @param signal - Current read. @returns Whether the current configuration was read and committed. */
async function readPolicyState(session: PolicyReadSession, signal: AbortSignal): Promise<boolean> {
  const { ready, client, controls } = session;
  const current = await client.readPolicy(ready.slug, signal);
  if (signal.aborted || current.status === "aborted") return false;
  if (!await checkPolicyViewer(session, signal)) return false;
  if (current.status === "failed") { showPolicyFailure(controls, current.code, current.message); return false; }
  commitPolicyState(controls, current.value);
  return true;
}

/** Retrieves original identity first; historical results never replace today's configuration. @param session - Current route session. @param signal - Current read. @param restore - Whether this is the first read after mounting. @returns Nothing after settling the phase. */
export async function readPolicyCurrent(session: PolicyReadSession, signal: AbortSignal, restore = false): Promise<void> {
  const { controls } = session;
  if (signal.aborted) return;
  controls.setPhase(PHASE.reading); markPolicyFresh(controls, false); controls.setConfirmed(false); controls.setRetryConfirmed(false); controls.setCanRetry(false); controls.setFailure(null);
  /** The first restore keeps the server-read requirements; explicit reads start without stale ones. */
  if (!restore) controls.setActivationBlock(null);
  let recovered = false;
  try {
    if (!await checkPolicyViewer(session, signal)) return;
    restorePolicyIntent(session);
    if (controls.pending.current) {
      const recovery = await recoverPolicyOriginal(session, controls.pending.current, signal);
      if (recovery === "stop") return;
      recovered = recovery === "recovered";
    }
    if ((!restore || controls.pending.current || recovered) && !await readPolicyState(session, signal)) return;
    markPolicyFresh(controls, true); controls.setPrivateVisible(true); controls.setPermissionDenied(false);
  } catch { if (!signal.aborted) controls.setErrorMessage(COPY.storageFailed); }
  finally { if (!signal.aborted) controls.setPhase((current) => settledPolicyPhase(current, controls.pending.current)); }
}

/** @param intent - Confirmed command. @returns The rule changes it applied. */
function policyChanges(intent: AdmissionPolicyBrowserIntent): Partial<AdmissionPolicyDraft> {
  if (intent.type === ADMISSION_POLICY_OPERATION.update) return intent.input;
  return intent.type === ADMISSION_POLICY_OPERATION.pause ? { isOpen: false } : {};
}

/** @param controlActivated - Whether admission control is active. @param isOpen - Whether new requests are accepted. @returns The public state of the policy. */
function policyPublicState(controlActivated: boolean, isOpen: boolean) {
  if (!controlActivated) return ADMISSION_POLICY_PUBLIC_STATE.draft;
  return isOpen ? ADMISSION_POLICY_PUBLIC_STATE.active : ADMISSION_POLICY_PUBLIC_STATE.paused;
}

/** @param current - State the write started from. @param intent - Confirmed command. @param result - Minimal response. @returns Whether the response follows from the observed version. */
function hasExpectedCounter(current: AdmissionPolicyStateDto, intent: AdmissionPolicyBrowserIntent, result: AdmissionPolicyMutationResult): boolean {
  if (intent.type === ADMISSION_POLICY_OPERATION.initialize) return true;
  return current.policy?.version === intent.input.expectedVersion && result.version === intent.input.expectedVersion + (result.changed ? 1 : 0);
}

/** Applies only a new confirmed minimal response at the observed current version; a first creation keeps the leader's draft. @param session - Current route session. @param intent - Confirmed command. @param result - Minimal response. @returns Nothing. */
function applyPolicyResult({ ready, controls }: PolicyReadSession, intent: AdmissionPolicyBrowserIntent, result: AdmissionPolicyMutationResult): void {
  const current = controls.stateRef.current;
  if (!current || result.policyId !== ready.tribeId) throw new Error("AdmissionPolicyContainer:applyResult policy owner mismatch");
  if (!hasExpectedCounter(current, intent, result)) throw new Error("AdmissionPolicyContainer:applyResult policy counter mismatch");
  /** A created policy starts from the server defaults, never from the unsaved draft; the server alone binds its messaging reference. */
  const base = current.policy ?? { ...createAdmissionPolicyDraft(current), messagingConnectionId: null, messagingConnectionVersion: null, id: result.policyId, usage: current.usage, requirements: [] };
  const policy = { ...base, ...policyChanges(intent), version: result.version, verificationEpoch: result.verificationEpoch, activatedAt: result.activatedAt };
  const next = { ...current, policy, controlActivated: result.controlActivated, state: policyPublicState(result.controlActivated, policy.isOpen),
    impact: { ...current.impact, contactTypeLocked: result.controlActivated, historicalLinksProtected: result.controlActivated } };
  const guarded = admissionPolicyStateResultSchema.parse(next);
  commitPolicyState(controls, guarded);
  /** Pausing also closes the draft, so a later save never reopens admissions silently. */
  if (intent.type !== ADMISSION_POLICY_OPERATION.initialize) controls.setDraft(createAdmissionPolicyDraft(guarded));
}

/** @param client - Rules transport. @param slug - Tribe route. @param intent - Command to send. @param signal - Current write. @returns The answer of the endpoint that owns the command. */
function dispatchPolicyIntent(client: AdmissionPolicyBrowserClient, slug: string, intent: AdmissionPolicyBrowserIntent, signal: AbortSignal) {
  if (intent.type === ADMISSION_POLICY_OPERATION.initialize) return client.initializePolicy(slug, intent.input, signal);
  if (intent.type === ADMISSION_POLICY_OPERATION.update) return client.updatePolicy(slug, intent.input, signal);
  if (intent.type === ADMISSION_POLICY_OPERATION.activate) return client.activatePolicy(slug, intent.input, signal);
  return client.pausePolicy(slug, intent.input, signal);
}

/** Persists before transport; uncertain/aborted writes retain their exact original UUID and payload. @param session - Current route session. @param intent - Command to send. @param signal - Current write. @returns How the write ended. */
async function sendPolicyIntent(session: PolicyReadSession, intent: AdmissionPolicyBrowserIntent, signal: AbortSignal): Promise<WriteResult> {
  const { ready, client, controls } = session;
  if (!await checkPolicyViewer(session, signal)) return { outcome: WRITE_OUTCOME.stopped };
  writeAdmissionPolicyIntent(ready.viewerId, ready.slug, intent); controls.pending.current = intent; markPolicyFresh(controls, false);
  const result = await dispatchPolicyIntent(client, ready.slug, intent, signal);
  if (signal.aborted || result.status === "aborted") return { outcome: WRITE_OUTCOME.stopped };
  if (!await checkPolicyViewer(session, signal)) return { outcome: WRITE_OUTCOME.stopped };
  if (result.status === "failed") {
    showPolicyFailure(controls, result.code, result.message);
    /** A legacy session-change answer keeps the original intent so reloading can still recover it. */
    if (result.uncertain || result.code === ADMISSION_ERROR_CODE.reauthenticationRequired) return { outcome: WRITE_OUTCOME.uncertain, code: result.code };
    writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); controls.pending.current = null;
    return { outcome: WRITE_OUTCOME.failed, code: result.code };
  }
  if (result.value.state === "started" || result.value.operationId !== intent.input.operationId) { controls.setErrorMessage(COPY.uncertain); return { outcome: WRITE_OUTCOME.uncertain }; }
  applyPolicyResult(session, intent, result.value.result);
  writeAdmissionPolicyIntent(ready.viewerId, ready.slug, null); controls.pending.current = null; markPolicyFresh(controls, true);
  return { outcome: WRITE_OUTCOME.completed };
}

/** Runs one write chain in the single write slot; only the pressed button shows its loading state. @param session - Current route session. @param action - Pressed action. @param work - Writes of the chain. @returns Nothing after settling the phase. */
export async function runPolicyWrite({ controls }: PolicyReadSession, action: AdmissionPolicyAction, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (controls.busy.current) return;
  controls.busy.current = true; controls.readController.current?.abort(); const controller = new AbortController(); controls.writeController.current = controller;
  controls.setPhase(PHASE.writing); controls.setPendingAction(action); controls.setStatusMessage(null); controls.setActivationBlock(null);
  /** A retry keeps its failure on screen until a new outcome replaces it, so its button keeps the focus. */
  if (action !== ADMISSION_POLICY_ACTION.retry) { controls.setErrorMessage(null); controls.setFailure(null); }
  try { await work(controller.signal); }
  catch { if (!controller.signal.aborted) { controls.setFailure(null); controls.setErrorMessage(COPY.storageFailed); } }
  finally {
    if (controls.writeController.current === controller) controls.busy.current = false;
    if (!controller.signal.aborted) { controls.setStage(null); controls.setPendingAction(null); controls.setCanRetry(false); controls.setPhase((current) => settledPolicyPhase(current, controls.pending.current)); }
  }
}

/** Announces a confirmed action with its own message, in the page and as a toast. @param controls - Stable controls. @param message - Confirmation. @returns Nothing. */
function succeedPolicy(controls: PolicyControls, message: string): void {
  controls.setErrorMessage(null); controls.setFailure(null); controls.setStatusMessage(message); toast.success(message);
}
/** A definitive failure offers a retry from its sub-step; an uncertain one is recovered through its original. @param controls - Stable controls. @param failedStage - Sub-step. @param rulesSaved - Whether the rules were already saved. @param result - Write result. @returns Nothing. */
function reportPolicyFailure(controls: PolicyControls, failedStage: AdmissionPolicyFlowStage, rulesSaved: boolean, result: WriteResult): void {
  controls.setFailure(result.outcome === WRITE_OUTCOME.failed ? { stage: failedStage, rulesSaved } : null);
}

/** @param controls - Stable controls. @param type - Operation. @param extra - Proposed settings or pause reason. @returns A validated new intent with a fresh UUID at the latest observed version, or null. */
function buildPolicyIntent(controls: PolicyControls, type: AdmissionPolicyBrowserIntent["type"], extra: Partial<AdmissionPolicyDraft> & { reason?: string } = {}): AdmissionPolicyBrowserIntent | null {
  const input = { operationId: newAdmissionOperationId(), confirmed: true, ...(type === ADMISSION_POLICY_OPERATION.initialize ? {} : { expectedVersion: controls.stateRef.current?.policy?.version }), ...extra };
  const parsed = admissionPolicyBrowserIntentSchema.safeParse({ type, input });
  if (!parsed.success) { controls.setFailure(null); controls.setErrorMessage(COPY.invalid); return null; }
  return parsed.data;
}

/** A write after a failed one first rereads the configuration; a version changed by someone else needs a new confirmation. @param session - Current route session. @param signal - Current write. @returns Whether the chain may continue. */
async function refreshPolicyBeforeWrite(session: PolicyReadSession, signal: AbortSignal): Promise<WriteResult> {
  const { ready, client, controls } = session;
  if (controls.freshRef.current) return { outcome: WRITE_OUTCOME.completed };
  const before = controls.stateRef.current?.policy?.version ?? null;
  if (!await checkPolicyViewer(session, signal)) return { outcome: WRITE_OUTCOME.stopped };
  const current = await client.readPolicy(ready.slug, signal);
  if (signal.aborted || current.status === "aborted" || !await checkPolicyViewer(session, signal)) return { outcome: WRITE_OUTCOME.stopped };
  if (current.status === "failed") { showPolicyFailure(controls, current.code, current.message); return { outcome: WRITE_OUTCOME.failed, code: current.code }; }
  commitPolicyState(controls, current.value); markPolicyFresh(controls, true);
  if ((current.value.policy?.version ?? null) === before) return { outcome: WRITE_OUTCOME.completed };
  controls.setConfirmed(false); controls.setFailure(null); controls.setErrorMessage(COPY.changedMeanwhile);
  return { outcome: WRITE_OUTCOME.stopped };
}

/** Rereads the configuration after a denied activation or resume and lists what the leader still has to resolve. @param session - Current route session. @param signal - Current write. @param blocked - Denied action. @param proposedRequirements - Requirements the proposed rules add. @returns Nothing. */
async function showPolicyRequirements(session: PolicyReadSession, signal: AbortSignal, blocked: BlockedAction, proposedRequirements: readonly AdmissionPolicyActivationReason[] = []): Promise<void> {
  const { ready, client, controls } = session;
  const current = await client.readPolicy(ready.slug, signal);
  if (signal.aborted || current.status === "aborted" || !await checkPolicyViewer(session, signal)) return;
  if (current.status === "ready") { commitPolicyState(controls, current.value); markPolicyFresh(controls, true); }
  controls.setErrorMessage(null); controls.setFailure(null);
  const savedRequirements = current.status === "ready" ? pendingRequirements(current.value) : [];
  controls.setActivationBlock({ message: BLOCKED_ACTION_COPY[blocked].message, note: BLOCKED_ACTION_COPY[blocked].note,
    preflightReasons: [], requirements: [...new Set([...proposedRequirements, ...savedRequirements])], unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 });
}

/** What a final save writes: the proposed rules, whether it also activates, and the failure being retried. */
export type FinalPolicyPlan = { proposed: AdmissionPolicyDraft; activating: boolean; previousFailure: AdmissionPolicyFailure | null };

/** @param proposed - Proposed rules. @param state - Current state. @returns The verification requirement new rules add to already active ones. */
function proposedVerificationRequirements(proposed: AdmissionPolicyDraft, state: AdmissionPolicyStateDto | null): AdmissionPolicyActivationReason[] {
  return proposed.requiresAdditionalVerification && !state?.policy?.requiresAdditionalVerification ? [ADMISSION_POLICY_CONFIGURATION_ERROR.verificationUnavailable] : [];
}

/** Creates the policy if missing and saves the rules when they changed. @param session - Current route session. @param plan - Final save plan. @param signal - Current write. @returns Whether the chain may continue. */
async function savePolicyRules(session: PolicyReadSession, { proposed, activating }: FinalPolicyPlan, signal: AbortSignal): Promise<boolean> {
  const { controls } = session;
  let created = false;
  if (!controls.stateRef.current?.policy) {
    const intent = buildPolicyIntent(controls, ADMISSION_POLICY_OPERATION.initialize); if (!intent) return false;
    const result = await sendPolicyIntent(session, intent, signal);
    if (result.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.saving, false, result); return false; }
    created = true;
  }
  if (!created && !(controls.stateRef.current && differsFromSaved(proposed, controls.stateRef.current))) return true;
  const intent = buildPolicyIntent(controls, ADMISSION_POLICY_OPERATION.update, proposed); if (!intent) return false;
  const result = await sendPolicyIntent(session, intent, signal);
  /** Editing active rules can ask for something the academy has not prepared yet, such as the channel for codes; the saved rules stay as they were. */
  if (!activating && result.outcome === WRITE_OUTCOME.failed && result.code === ADMISSION_ERROR_CODE.admissionIneligible) {
    controls.setConfirmed(false); await showPolicyRequirements(session, signal, "save", proposedVerificationRequirements(proposed, controls.stateRef.current)); return false;
  }
  if (result.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.saving, false, result); return false; }
  return true;
}

/** Checks requirements of saved rules and activates them, stopping where something fails. @param session - Current route session. @param signal - Current write. @returns Nothing. */
async function activateSavedPolicy(session: PolicySession, signal: AbortSignal): Promise<void> {
  const { ready, client, controls } = session;
  controls.setStage(STAGE.checking);
  if (!await checkPolicyViewer(session, signal)) return;
  const preflight = await client.readPreflight(ready.slug, signal);
  if (signal.aborted || preflight.status === "aborted" || !await checkPolicyViewer(session, signal)) return;
  if (preflight.status === "failed") { showPolicyFailure(controls, preflight.code, preflight.message); controls.setFailure({ stage: STAGE.checking, rulesSaved: true }); return; }
  if (!preflight.value.prepared) {
    controls.setErrorMessage(null); controls.setFailure(null);
    controls.setActivationBlock({ message: COPY.activationIneligible, note: COPY.activationBlockedNote, preflightReasons: preflight.value.reasons, requirements: [], ...preflight.value.impact });
    /** Memberships blocked by payment are decided in their own step, inserted just before the final one. */
    if (hasCommercialReason(preflight.value.reasons)) { controls.setStep(admissionPolicyStepIds(false, true).indexOf(ADMISSION_POLICY_STEP.memberships)); session.reloadReview(); }
    return;
  }
  controls.setStage(STAGE.activating);
  const intent = buildPolicyIntent(controls, ADMISSION_POLICY_OPERATION.activate); if (!intent) return;
  const result = await sendPolicyIntent(session, intent, signal);
  if (result.outcome === WRITE_OUTCOME.failed && result.code === ADMISSION_ERROR_CODE.admissionIneligible) { await showPolicyRequirements(session, signal, "activation"); return; }
  if (result.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.activating, true, result); return; }
  controls.setConfirmed(false); controls.setStep(0);
  succeedPolicy(controls, controls.stateRef.current?.policy?.isOpen ? COPY.activatedOpen : COPY.activatedPaused);
}

/** Guardar y activar / Guardar cambios: creates the policy if missing, saves the rules, checks requirements and activates, stopping where something fails. @param session - Current route session. @param plan - Final save plan. @param signal - Current write. @returns Nothing. */
export async function runFinalPolicyWrites(session: PolicySession, plan: FinalPolicyPlan, signal: AbortSignal): Promise<void> {
  const { controls } = session, { previousFailure } = plan;
  controls.setStage(previousFailure?.stage ?? STAGE.saving);
  const refreshed = await refreshPolicyBeforeWrite(session, signal);
  /** A reread that fails keeps describing the sub-step being retried and what was already saved. */
  if (refreshed.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, previousFailure?.stage ?? STAGE.saving, previousFailure?.rulesSaved ?? false, refreshed); return; }
  controls.setStage(STAGE.saving);
  if (!await savePolicyRules(session, plan, signal)) return;
  if (!plan.activating || controls.stateRef.current?.controlActivated) { controls.setConfirmed(false); controls.setEditing(false); controls.setStep(0); succeedPolicy(controls, COPY.rulesSaved); return; }
  await activateSavedPolicy(session, signal);
}

/** Closes new requests with the reason the contract requires; the saved draft closes too. @param session - Current route session. @param pauseReason - Reason given. @param signal - Current write. @returns Nothing. */
export async function pausePolicyWrites(session: PolicyReadSession, pauseReason: string, signal: AbortSignal): Promise<void> {
  const { controls } = session;
  controls.setStage(STAGE.pausing);
  const refreshed = await refreshPolicyBeforeWrite(session, signal);
  if (refreshed.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.pausing, false, refreshed); return; }
  const intent = buildPolicyIntent(controls, ADMISSION_POLICY_OPERATION.pause, { reason: pauseReason }); if (!intent) return;
  const result = await sendPolicyIntent(session, intent, signal);
  if (result.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.pausing, false, result); return; }
  controls.setPauseOpen(false); controls.setPauseReason(""); succeedPolicy(controls, COPY.paused);
}

/** Reopens new requests by saving the current rules with intake enabled; the server rechecks readiness. @param session - Current route session. @param signal - Current write. @returns Nothing. */
export async function resumePolicyWrites(session: PolicyReadSession, signal: AbortSignal): Promise<void> {
  const { controls } = session;
  controls.setStage(STAGE.resuming);
  const refreshed = await refreshPolicyBeforeWrite(session, signal);
  if (refreshed.outcome !== WRITE_OUTCOME.completed || !controls.stateRef.current) { reportPolicyFailure(controls, STAGE.resuming, false, refreshed); return; }
  const intent = buildPolicyIntent(controls, ADMISSION_POLICY_OPERATION.update, { ...createAdmissionPolicyDraft(controls.stateRef.current), isOpen: true }); if (!intent) return;
  const result = await sendPolicyIntent(session, intent, signal);
  if (result.outcome === WRITE_OUTCOME.failed && result.code === ADMISSION_ERROR_CODE.admissionIneligible) { await showPolicyRequirements(session, signal, "resume"); return; }
  if (result.outcome !== WRITE_OUTCOME.completed) { reportPolicyFailure(controls, STAGE.resuming, false, result); return; }
  succeedPolicy(controls, COPY.resumed);
}

/** Resends the exact original payload and UUID. @param session - Current route session. @param intent - Stored original. @param signal - Current write. @returns Nothing. */
export async function retryPolicyOriginal(session: PolicyReadSession, intent: AdmissionPolicyBrowserIntent, signal: AbortSignal): Promise<void> {
  session.controls.setStage(STAGE.retrying);
  const result = await sendPolicyIntent(session, intent, signal);
  session.controls.setRetryConfirmed(false);
  if (result.outcome === WRITE_OUTCOME.completed) succeedPolicy(session.controls, COPY.recovered);
}

/** @param controlActivated - Whether admission control is active. @param preflight - Fresh preflight, if read. @param requirements - Pending requirements of the saved policy. @returns The block describing what still needs work. */
function recheckBlock(controlActivated: boolean, preflight: AdmissionPolicyPreflightDto | null, requirements: AdmissionPolicyActivationReason[]): AdmissionPolicyActivationBlock {
  const copy = controlActivated ? BLOCKED_ACTION_COPY.resume : BLOCKED_ACTION_COPY.activation;
  return { message: copy.message, note: copy.note,
    preflightReasons: preflight && !preflight.prepared ? preflight.reasons : [], requirements, unknownCommercialMemberCount: preflight?.impact.unknownCommercialMemberCount ?? 0, privilegedCommercialMemberCount: preflight?.impact.privilegedCommercialMemberCount ?? 0 };
}

/** @param session - Current route session. @param next - Fresh requirements block. @returns Nothing after showing it, or the ready notice when nothing is missing. */
function applyRecheckBlock({ controls, reloadReview }: PolicySession, next: AdmissionPolicyActivationBlock): void {
  if (!blockReasons(next).length) { controls.setActivationBlock(null); controls.setStatusMessage(ADMISSION_POLICY_PLATFORM_COPY.recheckedReady); return; }
  controls.setActivationBlock(next); controls.setStatusMessage(ADMISSION_POLICY_PLATFORM_COPY.rechecked);
  if (hasCommercialReason(next.preflightReasons)) reloadReview();
}

/** Volver a comprobar: rereads the configuration and the requirements, without writing or asking for another decision. @param session - Current route session. @param controller - Read slot of this recheck. @returns Nothing after releasing the slot. */
async function recheckPolicyRequirements(session: PolicySession, controller: AbortController): Promise<void> {
  const { ready, client, controls } = session, { signal } = controller;
  try {
    if (!await checkPolicyViewer(session, signal)) return;
    const current = await client.readPolicy(ready.slug, signal);
    if (signal.aborted || current.status === "aborted" || !await checkPolicyViewer(session, signal)) return;
    if (current.status === "failed") { showPolicyFailure(controls, current.code, current.message); return; }
    commitPolicyState(controls, current.value); markPolicyFresh(controls, true);
    const requirements = pendingRequirements(current.value);
    const preflight = current.value.controlActivated ? null : await client.readPreflight(ready.slug, signal);
    if (signal.aborted || preflight?.status === "aborted" || !await checkPolicyViewer(session, signal)) return;
    if (preflight?.status === "failed") { showPolicyFailure(controls, preflight.code, preflight.message); return; }
    applyRecheckBlock(session, recheckBlock(current.value.controlActivated, preflight?.status === "ready" ? preflight.value : null, requirements));
  } catch { if (!signal.aborted) controls.setErrorMessage(COPY.storageFailed); }
  finally { if (controls.readController.current === controller) { controls.busy.current = false; controls.setRechecking(false); } }
}

/** @param session - Current route session. @returns Nothing after starting one recheck in the read slot. */
export function startPolicyRecheck(session: PolicySession): void {
  const { controls } = session;
  controls.busy.current = true; controls.readController.current?.abort(); const controller = new AbortController(); controls.readController.current = controller;
  controls.setRechecking(true); controls.setStatusMessage(null); controls.setErrorMessage(null);
  void recheckPolicyRequirements(session, controller);
}
