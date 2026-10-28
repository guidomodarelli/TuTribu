/** Explicit messaging connection operations of the connections route: viewer checks, original references, writes and their recovery. @module messaging-connections-operations */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toastMessagingRead, toastMessagingWrite, type MessagingConnectionsFeedback } from "./messaging-connections-feedback";
import type { useMessagingActivationController } from "./messaging-activation-controller";
import type { useMessagingLifecycleController } from "./messaging-lifecycle-controller";
import type { useMessagingDiagnosticController } from "./messaging-diagnostic-controller";
import type { useMessagingResourceController } from "./messaging-resource-controller";
import type { MessagingActivationBrowserClient } from "@/src/modules/messaging/application/ports/messaging-activation-browser-client";
import type { MessagingLifecycleBrowserClient } from "@/src/modules/messaging/application/ports/messaging-lifecycle-browser-client";
import type { MessagingDiagnosticBrowserClient } from "@/src/modules/messaging/application/ports/messaging-diagnostic-browser-client";
import type { MessagingResourcesBrowserClient } from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type { MessagingUsageBrowserResult } from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type { MessagingConnectionsBrowserClient } from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import type { MessagingConnectionsIntentStore, MessagingConnectionsPendingIntent, MessagingDiagnosticObservationReference } from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import type { MessagingConnectionsPageState } from "@/src/modules/messaging/application/results/messaging-connections-page-state";
import type { MessagingConfigurationResult } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { MessagingConnectionMutationResult } from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import type { MessagingConnectionLifecycleResult } from "@/src/modules/messaging/application/results/messaging-connection-lifecycle-result";
import type { MessagingConnectionOperationRecovery } from "@/src/modules/messaging/application/results/messaging-connection-operation-result";
import type { MessagingConnectionSuspensionInput } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import type { ConnectionDiagnosticIssueResult } from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type { ConnectionDiagnosticSnapshot } from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import type { MessagingDiagnosticDestination } from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import type { MessagingLifecycleConnectionView } from "@/components/academy-admissions/messaging-connection-lifecycle";
import { validateMessagingChannelDraft, type MessagingChannelDraft } from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import { MESSAGING_KEY_REPLACEMENT_COPY as REPLACEMENT_COPY, MESSAGING_LIFECYCLE_UI_COPY as LIFECYCLE_COPY } from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "@/src/modules/messaging/constants/messaging-connection-security";
import { MESSAGING_ACTIVATION_UI_COPY as ACTIVATION_COPY } from "@/src/modules/messaging/constants/messaging-activation-browser";
import { MESSAGING_DIAGNOSTIC_UI_COPY as DIAGNOSTIC_COPY, MESSAGING_DIAGNOSTIC_ABSENT_ARCHIVE_AFTER_MS, MESSAGING_DIAGNOSTIC_RECOVERY_UI_COPY as DIAGNOSTIC_RECOVERY_COPY } from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import { VERIFICATION_ISSUANCE_OUTCOME } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME } from "@/src/modules/messaging/constants/connection-diagnostic";
import { MESSAGING_RESOURCE_UI_COPY as RESOURCE_COPY } from "@/src/modules/messaging/constants/messaging-resources-browser";
import { isMessagingDiagnosticSettled } from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import { messagingConnectionsStepId } from "@/src/modules/messaging/application/commands/messaging-connections-flow";
import { MESSAGING_CONNECTIONS_STEP_KIND as STEP_KIND } from "@/src/modules/messaging/constants/messaging-connections-workspace";
import { MESSAGING_INITIAL_PROVIDER_ID, MESSAGING_CREDENTIAL_PUBLIC_STATE } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CONNECTIONS_BROWSER_PHASE as PHASE, MESSAGING_CONNECTIONS_UI_COPY as COPY, MESSAGING_CREDENTIAL_CHECK_UI_COPY as CHECK_COPY, MESSAGING_CONNECTION_RECOVERY_UI_COPY as RECOVERY_COPY, MESSAGING_CONNECTIONS_WRITE_ACTION as WRITE_ACTION, type MessagingConnectionsWriteAction, MESSAGING_CONNECTION_HISTORY_LIMIT, MESSAGING_CONNECTIONS_RESTORED_SNAPSHOT_MAX_AGE_MS } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { MESSAGING_CREDENTIAL_MODE } from "@/src/modules/messaging/constants/messaging-credential-validation";
import { newAdmissionOperationId } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { MESSAGING_ERROR_MESSAGE, MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Browser phase of the connections route. */
export type ConnectionsPhase = typeof PHASE[keyof typeof PHASE];
/** Server snapshot of a connections route the viewer may read. */
export type ConnectionsReady = Extract<MessagingConnectionsPageState, { kind: "ready" }>;
/** Current own configuration as seen by a leader. */
export type LeaderConfiguration = Extract<MessagingConfigurationResult, { audience: "leader" }>;
/** Candidate connection of a leader configuration. */
export type ConnectionCandidate = NonNullable<LeaderConfiguration["candidate"]>;
/** A test that was issued, with its masked public tuple. */
export type IssuedDiagnostic = Extract<ConnectionDiagnosticIssueResult, { outcome: "issued" }>;
/** Field errors of the key form. */
export type CredentialFieldErrors = Partial<Record<"name" | "apiKey" | "confirmation", string>>;
/** A test or its code verification: never resumed, and followed until its result is read or its absence is confirmed long enough. */
type DiagnosticPendingIntent = Extract<MessagingConnectionsPendingIntent, { type: "diagnose_messaging_connection" | "verify_messaging_diagnostic" }>;
type CompletedOperation = Extract<MessagingConnectionOperationRecovery, { state: "completed" }>;
type ResolvedChannelReferences = Extract<ReturnType<typeof validateMessagingChannelDraft>, { valid: true }>["references"];
type ConnectionsSetter<Value> = Dispatch<SetStateAction<Value>>;
/** Route snapshot and the observation of one serialized operation. */
type OperationRun = { ready: ConnectionsReady; controller: AbortController };

/** Current render facts, ports, refs, setters and controllers every explicit operation reads; it grants no authority. */
export type ConnectionsContext = {
  ready: ConnectionsReady | null;
  client: MessagingConnectionsBrowserClient; store: MessagingConnectionsIntentStore; resourcesClient: MessagingResourcesBrowserClient;
  diagnosticClient: MessagingDiagnosticBrowserClient; activationClient: MessagingActivationBrowserClient; lifecycleClient: MessagingLifecycleBrowserClient;
  busy: RefObject<boolean>; mounted: RefObject<boolean>; observation: RefObject<AbortController | null>;
  firstDiagnosticAbsence: RefObject<{ operationId: string; observedAt: number } | null>; report: RefObject<MessagingConnectionsFeedback | null>;
  configuration: MessagingConfigurationResult | null; candidate: ConnectionCandidate | null; pending: MessagingConnectionsPendingIntent | null; needsCurrent: boolean; phase: ConnectionsPhase;
  name: string; apiKey: string; confirmed: boolean; validationConfirmed: boolean; canResume: boolean; resumeConfirmed: boolean; canArchive: boolean; archiveConfirmed: boolean;
  diagnosticReferences: MessagingDiagnosticObservationReference[]; replaceable: ConnectionCandidate | null; replacementScope: string; replacementKey: string;
  setConfiguration: ConnectionsSetter<MessagingConfigurationResult | null>; setObservedAt: (value: string) => void; setCurrentReadFailed: (value: boolean) => void; setReadingCurrent: (value: boolean) => void;
  setWritingAction: (value: MessagingConnectionsWriteAction | null) => void; setPhase: ConnectionsSetter<ConnectionsPhase>; setNotice: (value: string | null) => void;
  setName: (value: string) => void; setApiKey: (value: string) => void; setConfirmed: (value: boolean) => void; setValidationConfirmed: (value: boolean) => void; setNeedsCurrent: (value: boolean) => void;
  setCanResume: (value: boolean) => void; setResumeConfirmed: (value: boolean) => void; setCanArchive: (value: boolean) => void; setArchiveConfirmed: (value: boolean) => void;
  setHistory: ConnectionsSetter<MessagingConnectionsPendingIntent[]>; setPending: (value: MessagingConnectionsPendingIntent | null) => void; setFieldErrors: (value: CredentialFieldErrors) => void;
  setValidationAttempt: ConnectionsSetter<number>; setDiagnosticReferences: ConnectionsSetter<MessagingDiagnosticObservationReference[]>; setReplacementScope: (value: string) => void;
  setFocusKey: (value: boolean) => void; setCurrentStepId: (value: string) => void;
  resourceController: ReturnType<typeof useMessagingResourceController>; diagnosticController: ReturnType<typeof useMessagingDiagnosticController>;
  activationController: ReturnType<typeof useMessagingActivationController>; lifecycleController: ReturnType<typeof useMessagingLifecycleController>;
};

/** @param intent - Current pending reference. @returns Whether it is a test or its code verification. */
export const isDiagnosticIntent = (intent: MessagingConnectionsPendingIntent): intent is DiagnosticPendingIntent => intent.type === REAUTHENTICATION_OPERATION.diagnoseMessagingConnection || intent.type === REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic;

/**
 * @param intent - Test or verification the registry just reported absent.
 * @param firstObservedAt - When this view first saw that same original absent, if it already did.
 * @param observedAt - Instant of the current read.
 * @returns When the absence started counting: its dispatch, never later than now, or the first observed absence when an older reference lacks that instant.
 */
function diagnosticAbsenceSince(intent: DiagnosticPendingIntent, firstObservedAt: number | null, observedAt: number): number {
  const dispatchedAt = intent.startedAt ? Date.parse(intent.startedAt) : Number.NaN;
  return Number.isFinite(dispatchedAt) ? Math.min(dispatchedAt, observedAt) : firstObservedAt ?? observedAt;
}

/** @param history - Archived references. @param archived - Reference just archived. @returns The history with the reference added once. */
function appendArchivedIntent(history: MessagingConnectionsPendingIntent[], archived: MessagingConnectionsPendingIntent): MessagingConnectionsPendingIntent[] { return history.some((entry) => entry.type === archived.type && entry.operationId === archived.operationId) ? history : [...history, archived]; }

/** @param current - Phase when an operation settles. @returns An unavailable view as is, otherwise idle. */
function settledConnectionsPhase(current: ConnectionsPhase): ConnectionsPhase {
  return current === PHASE.unavailable ? current : PHASE.idle;
}

/** @param value - Current configuration. @param connectionId - Expected candidate. @param configurationVersion - Expected candidate configuration. @returns Whether the leader's candidate is still exactly that configuration. */
function candidateMatches(value: MessagingConfigurationResult, connectionId: string, configurationVersion: number): boolean {
  return value.audience === TRIBE_MEMBER_ROLE.leader && value.candidate?.id === connectionId && value.candidate.configurationVersion === configurationVersion;
}

/** @param value - Current configuration. @param connectionId - Expected selection. @param configurationVersion - Expected selection configuration. @returns Whether the leader's selection is exactly that configuration. */
function selectedMatches(value: MessagingConfigurationResult, connectionId: string, configurationVersion: number): boolean {
  return value.audience === TRIBE_MEMBER_ROLE.leader && value.selected?.id === connectionId && value.selected.configurationVersion === configurationVersion;
}

/** @param original - Original lookup of a test. @param reference - Preserved issuance reference. @returns The issued result when the lookup is the completed issuance of exactly that reference, otherwise null. */
function issuedOriginalResult(original: MessagingUsageBrowserResult<MessagingConnectionOperationRecovery>, reference: MessagingDiagnosticObservationReference): IssuedDiagnostic | null {
  if (original.status !== "ready" || original.value.type !== REAUTHENTICATION_OPERATION.diagnoseMessagingConnection || original.value.state !== OPERATION_STATE.completed) return null;
  const result = original.value.result;
  if (result.outcome !== VERIFICATION_ISSUANCE_OUTCOME.issued || result.connectionId !== reference.connectionId || result.connectionVersion !== reference.configurationVersion || result.channel !== reference.channel) return null;
  return result;
}

/** @param context - Current render facts. @param next - Operation outcome to announce when the current operation settles. @returns Nothing. */
function emitFeedback(context: ConnectionsContext, next: MessagingConnectionsFeedback): void { context.report.current = next; }

/** @param context - Current render facts. @param text - Persistent explanation of an unconfirmed original, kept above the steps. @returns Nothing after also announcing the short failure once. */
function holdPending(context: ConnectionsContext, text: string): void { context.setNotice(text); emitFeedback(context, { kind: "alert", text: COPY.unconfirmed }); }

/** @param context - Current render facts. @param run - One serialized operation that may emit its outcome. @returns That outcome, or null when it stays in the page. */
async function collectFeedback(context: ConnectionsContext, run: () => Promise<void>): Promise<MessagingConnectionsFeedback | null> {
  context.report.current = null; await run(); const outcome = context.report.current; context.report.current = null; return outcome;
}

/** @param setters - Configuration setters. @param value - Authoritative own configuration. @returns Nothing after storing it with its observation time; a successful read also settles an earlier failed one. */
export function applyConfiguration(setters: Pick<ConnectionsContext, "setConfiguration" | "setObservedAt" | "setCurrentReadFailed">, value: MessagingConfigurationResult): void {
  setters.setConfiguration(value); setters.setObservedAt(new Date().toISOString()); setters.setCurrentReadFailed(false);
}

/** @param context - Current render facts. @param action - Explicit control whose original write starts now. @returns Nothing after entering the shared writing phase. */
function startWriting(context: ConnectionsContext, action: MessagingConnectionsWriteAction): void { context.setWritingAction(action); context.setPhase(PHASE.writing); }

/** @param context - Current render facts. @param signal - Current operation observation. @returns Whether the same SSR viewer remains current; role/resource authority is independently server-checked. */
export async function checkConnectionsViewer(context: ConnectionsContext, signal: AbortSignal): Promise<boolean> {
  const { ready } = context;
  if (!ready) return false;
  const current = await context.client.viewer(signal);
  if (signal.aborted || !context.mounted.current) return false;
  if (current.status !== "ready" || current.value?.id !== ready.viewerId) { context.setApiKey(""); context.setConfirmed(false); context.setPhase(PHASE.unavailable); context.setNotice(COPY.viewerChanged); return false; }
  return true;
}

/** @param context - Current render facts. @param intent - Metadata reference, never the input key. @returns Whether it was safely saved/cleared for this exact viewer/route. */
function retainIntent(context: ConnectionsContext, intent: MessagingConnectionsPendingIntent | null): boolean {
  const { ready } = context;
  if (!ready || !context.store.write(ready.viewerId, ready.slug, intent)) {
    if (intent === null) context.setNotice(COPY.clearFailed); else emitFeedback(context, { kind: "alert", text: COPY.storageUnavailable });
    return false;
  }
  context.setPending(intent); context.setNotice(null);
  if (intent === null) { context.setCanResume(false); context.setCanArchive(false); context.setArchiveConfirmed(false); context.setResumeConfirmed(false); }
  return true;
}

/** @param context - Current render facts. @param operationId - Confirmed original issuance UUID. @param result - Guarded masked issued tuple. @returns Whether its safe reference survives a page reload; no recipient/code is persisted. */
function rememberDiagnostic(context: ConnectionsContext, operationId: string, result: IssuedDiagnostic): boolean {
  const { ready } = context;
  const reference = { operationId, connectionId: result.connectionId, configurationVersion: result.connectionVersion, channel: result.channel };
  if (!ready || !context.store.writeDiagnostic(ready.viewerId, ready.slug, reference)) { emitFeedback(context, { kind: "alert", text: COPY.storageUnavailable }); return false; }
  context.setDiagnosticReferences((previous) => [...previous.filter((entry) => entry.operationId !== operationId), reference]);
  return true;
}

/** @param context - Current render facts. @returns The controller of a new serialized observation. */
function beginObservation(context: ConnectionsContext): AbortController {
  context.busy.current = true; const controller = new AbortController(); context.observation.current = controller;
  return controller;
}

/** @param context - Current render facts. @returns Nothing after releasing the serialized slot. */
function endObservation(context: ConnectionsContext): void {
  context.busy.current = false; if (context.mounted.current) context.setPhase(settledConnectionsPhase);
}

/** @param context - Current render facts. @param controller - Current observation. @returns Whether the reply may be applied: the observation was not stopped and the viewer is still current. */
async function stillCurrent(context: ConnectionsContext, controller: AbortController): Promise<boolean> {
  if (controller.signal.aborted || !context.mounted.current) return false;
  return checkConnectionsViewer(context, controller.signal);
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @returns The current configuration read, or null when the observation stopped. */
async function readFreshConfiguration(context: ConnectionsContext, { ready, controller }: OperationRun) {
  const current = await context.client.read(ready.slug, controller.signal);
  return await stillCurrent(context, controller) ? current : null;
}

/** @param context - Current render facts. @param outcome - Write that did not complete. @param pendingText - Explanation kept while the original is unconfirmed. @returns Nothing after releasing a definitive failure or keeping an uncertain original. */
function settleWriteFailure(context: ConnectionsContext, outcome: MessagingUsageBrowserResult<unknown>, pendingText: string): void {
  if (outcome.status === "failed" && !outcome.uncertain) {
    if (outcome.code === MESSAGING_ERROR_CODE.connectionConflict) context.setNeedsCurrent(true);
    if (retainIntent(context, null)) emitFeedback(context, { kind: "alert", text: outcome.message });
    return;
  }
  holdPending(context, pendingText);
}

/** @param context - Current render facts. @returns Nothing after clearing the key, every consent and the controllers' confirmations. */
function resetConfirmations(context: ConnectionsContext): void {
  context.setApiKey(""); context.setConfirmed(false); context.setValidationConfirmed(false);
  context.resourceController.resetConfirmation(); context.activationController.reset(); context.lifecycleController.reset();
}

/** @param context - Current render facts. @returns Whether no other operation, original or stale configuration blocks a new one. */
function isIdle(context: ConnectionsContext): boolean {
  return !context.busy.current && !context.pending && !context.needsCurrent && context.phase === PHASE.idle;
}

/** @param context - Current render facts. @param request - Explicit own read. @param settle - Local draft/page update after current viewer checks. @returns Nothing after one serialized observation, never an automatic retry. */
export async function observeResource<Value>(context: ConnectionsContext, request: (signal: AbortSignal) => Promise<MessagingUsageBrowserResult<Value>>, settle: (outcome: MessagingUsageBrowserResult<Value>) => void): Promise<void> {
  if (!context.ready || !isIdle(context)) return;
  const controller = beginObservation(context); context.setPhase(PHASE.recovering); resetConfirmations(context);
  try {
    if (!await checkConnectionsViewer(context, controller.signal)) return;
    const outcome = await request(controller.signal);
    if (!await stillCurrent(context, controller)) return;
    settle(outcome);
  } finally { endObservation(context); }
}

/** A lifecycle change and, for a key replacement, its announcement and follow-up. */
type LifecycleRequest = { connection: MessagingLifecycleConnectionView; retiring: boolean; reason: MessagingConnectionSuspensionInput["reason"]; retirement?: { text: string; onRetired: () => void } };

/** @param value - Current configuration. @param committed - Confirmed lifecycle result. @param retiring - Whether it retired the connection. @returns Whether the current configuration still reflects that result. */
function lifecycleApplies(value: MessagingConfigurationResult, committed: MessagingConnectionLifecycleResult, retiring: boolean): boolean {
  if (value.audience !== TRIBE_MEMBER_ROLE.leader) return false;
  const matching = [value.selected, value.candidate].find((resource) => resource?.id === committed.id);
  return retiring ? !matching : matching?.version === committed.version && matching.state === committed.state;
}

/** @param applies - Whether the current configuration reflects the change. @param request - The lifecycle change. @returns The announcement of a confirmed change. */
function lifecycleMessage(applies: boolean, { retiring, reason, retirement }: LifecycleRequest): string {
  if (!applies) return LIFECYCLE_COPY.historical;
  if (retiring) return retirement?.text ?? LIFECYCLE_COPY.retired;
  return reason === MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise ? LIFECYCLE_COPY.compromised : LIFECYCLE_COPY.stopped;
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param request - The lifecycle change. @returns Nothing after one original write reconciled with the current owner. */
async function runLifecycle(context: ConnectionsContext, { ready, controller }: OperationRun, request: LifecycleRequest): Promise<void> {
  const { connection, retiring, reason } = request;
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const operationId = newAdmissionOperationId(), original = { connectionId: connection.id, expectedVersion: connection.version };
  const intent: MessagingConnectionsPendingIntent = retiring ? { type: REAUTHENTICATION_OPERATION.disconnectMessagingConnection, operationId, original } : { type: REAUTHENTICATION_OPERATION.suspendMessagingConnection, operationId, original: { ...original, reason } };
  if (!retainIntent(context, intent)) return;
  const scope = { slug: ready.slug, connectionId: connection.id }, input = { operationId, expectedVersion: connection.version, confirmed: true as const };
  const outcome = retiring ? await context.lifecycleClient.disconnect(scope, input, controller.signal) : await context.lifecycleClient.suspend(scope, { ...input, reason }, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status !== "ready" || outcome.value.state !== OPERATION_STATE.completed) { settleWriteFailure(context, outcome, LIFECYCLE_COPY.pending); return; }
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, LIFECYCLE_COPY.pending); return; }
  applyConfiguration(context, current.value);
  const applies = lifecycleApplies(current.value, outcome.value.result, retiring);
  if (applies && retiring) request.retirement?.onRetired();
  if (retainIntent(context, null)) emitFeedback(context, { kind: "status", text: lifecycleMessage(applies, request) });
}

/** @param context - Current render facts. @param request - Exact own current view resource, explicit retirement or suspension cause, and the follow-up of a confirmed key replacement. @returns Original local metadata reconciled with current owner, without SDK or route refresh. */
export async function performLifecycle(context: ConnectionsContext, request: LifecycleRequest): Promise<void> {
  const { ready } = context;
  if (!ready || !isIdle(context) || context.configuration?.audience !== TRIBE_MEMBER_ROLE.leader) return;
  await toastMessagingWrite(request.retiring ? LIFECYCLE_COPY.retiring : LIFECYCLE_COPY.stopping, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, request.retirement ? WRITE_ACTION.replaceCandidateKey : WRITE_ACTION.changeLifecycle); context.setReplacementScope(""); resetConfirmations(context); context.diagnosticController.clearPrivate();
    try { await runLifecycle(context, { ready, controller }, request); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @returns Nothing after one explicit retirement of the candidate only, then back to an empty Clave form that keeps its name; the selection is never touched. */
export async function replaceCandidateKey(context: ConnectionsContext): Promise<void> {
  const retired = context.replaceable;
  if (!retired || context.replacementScope !== context.replacementKey) return;
  await performLifecycle(context, { connection: { id: retired.id, name: retired.name, version: retired.version, state: retired.state, selected: false, candidate: true }, retiring: true, reason: MESSAGING_CONNECTION_SECURITY_REASON.securityStop,
    retirement: { text: REPLACEMENT_COPY.retired(retired.name), onRetired: () => { context.setName(retired.name); context.setFocusKey(true); context.setCurrentStepId(messagingConnectionsStepId(STEP_KIND.key)); } } });
}

/** @param context - Current render facts. @returns Nothing after the leader confirmed emptying a full history down to its latest reference; earlier sends are neither cancelled nor repeated, and a storage failure keeps every reference. */
export function clearEarlierDiagnostics(context: ConnectionsContext): void {
  const { ready } = context;
  if (!ready || context.busy.current || context.pending || context.phase !== PHASE.idle) return;
  if (!context.store.keepLatestDiagnostic(ready.viewerId, ready.slug)) { toastMessagingRead({ kind: "alert", text: DIAGNOSTIC_COPY.earlierClearFailed }); return; }
  context.setDiagnosticReferences((previous) => previous.slice(-1)); toastMessagingRead({ kind: "status", text: DIAGNOSTIC_COPY.earlierCleared });
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param reference - Preserved issued reference. @returns Nothing after the original/current lookup. */
async function runIssuedDiagnosticRead(context: ConnectionsContext, { ready, controller }: OperationRun, reference: MessagingDiagnosticObservationReference): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const original = await context.client.operation(ready.slug, reference.operationId, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  const issued = issuedOriginalResult(original, reference);
  if (!issued) { emitFeedback(context, { kind: "alert", text: DIAGNOSTIC_COPY.pending }); return; }
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { emitFeedback(context, { kind: "alert", text: DIAGNOSTIC_COPY.pending }); return; }
  applyConfiguration(context, current.value);
  const applies = candidateMatches(current.value, reference.connectionId, reference.configurationVersion);
  if (applies) { if (!rememberDiagnostic(context, reference.operationId, issued)) return; context.diagnosticController.acceptIssuance(issued); }
  emitFeedback(context, { kind: "status", text: applies ? DIAGNOSTIC_COPY.issued : DIAGNOSTIC_COPY.originalHistorical });
}

/** @param context - Current render facts. @param reference - Preserved issued UUID and exact public scope. @returns Nothing after explicit original/current lookup; no new challenge or code is created. */
export async function readIssuedDiagnostic(context: ConnectionsContext, reference: MessagingDiagnosticObservationReference): Promise<void> {
  const { ready } = context;
  if (!ready || context.busy.current || context.pending || context.phase !== PHASE.idle) return;
  toastMessagingRead(await collectFeedback(context, async () => {
    const controller = beginObservation(context); context.setPhase(PHASE.recovering); context.activationController.reset(); context.lifecycleController.reset(); context.diagnosticController.clearPrivate();
    try { await runIssuedDiagnosticRead(context, { ready, controller }, reference); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param result - Original initial candidate metadata. @returns Nothing after applying only its incremental view facts and clearing private input. */
function applyCreated(context: ConnectionsContext, result: MessagingConnectionMutationResult): void {
  context.setApiKey(""); context.setConfirmed(false);
  context.setConfiguration((current) => current?.audience === "leader" ? { ...current, candidate: { ...result, credentialState: MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated, credentialMode: MESSAGING_CREDENTIAL_MODE.unknown, capabilities: [] } } : current);
  if (retainIntent(context, null)) emitFeedback(context, { kind: "status", text: COPY.saved });
  context.setPhase(PHASE.idle);
}

/** @param context - Current render facts. @param result - Recovered issuance. @param value - Current configuration. @returns Its announcement, after accepting it when it still applies. */
function recoveredIssuanceFeedback(context: ConnectionsContext, result: Extract<CompletedOperation, { type: "diagnose_messaging_connection" }>["result"], value: MessagingConfigurationResult): MessagingConnectionsFeedback {
  if (result.outcome !== VERIFICATION_ISSUANCE_OUTCOME.issued) return { kind: "alert", text: MESSAGING_ERROR_MESSAGE[result.code] };
  const applies = candidateMatches(value, result.connectionId, result.connectionVersion);
  if (applies) context.diagnosticController.acceptIssuance(result);
  return { kind: "status", text: applies ? DIAGNOSTIC_COPY.issued : DIAGNOSTIC_COPY.originalHistorical };
}

/** @param context - Current render facts. @param pending - Recovered original reference. @param result - Recovered verification. @param value - Current configuration. @returns Its announcement, after accepting it when it still applies. */
function recoveredVerificationFeedback(context: ConnectionsContext, pending: MessagingConnectionsPendingIntent, result: Extract<CompletedOperation, { type: "verify_messaging_diagnostic" }>["result"], value: MessagingConfigurationResult): MessagingConnectionsFeedback {
  if (result.outcome !== CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified) return { kind: "alert", text: MESSAGING_ERROR_MESSAGE[result.code] };
  const applies = pending.type === REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic && candidateMatches(value, pending.original.connectionId, result.connectionVersion);
  if (applies) context.diagnosticController.acceptVerification(result);
  return { kind: "status", text: applies ? DIAGNOSTIC_COPY.verified : DIAGNOSTIC_COPY.originalHistorical };
}

/** @param context - Current render facts. @param pending - Recovered original reference. @param operation - Completed original. @param value - Current configuration. @returns The announcement of the recovered original. */
function recoveredOriginalFeedback(context: ConnectionsContext, pending: MessagingConnectionsPendingIntent, operation: CompletedOperation, value: MessagingConfigurationResult): MessagingConnectionsFeedback {
  if (operation.type === REAUTHENTICATION_OPERATION.validateMessagingConnection) return operation.result.failureCode ? { kind: "alert", text: MESSAGING_ERROR_MESSAGE[operation.result.failureCode] } : { kind: "status", text: CHECK_COPY.recovered };
  if (operation.type === REAUTHENTICATION_OPERATION.diagnoseMessagingConnection) return recoveredIssuanceFeedback(context, operation.result, value);
  if (operation.type === REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic) return recoveredVerificationFeedback(context, pending, operation.result, value);
  if (operation.type === REAUTHENTICATION_OPERATION.activateMessagingConnection) return { kind: "status", text: selectedMatches(value, operation.result.id, operation.result.configurationVersion) ? ACTIVATION_COPY.recovered : ACTIVATION_COPY.historical };
  if (operation.type === REAUTHENTICATION_OPERATION.suspendMessagingConnection || operation.type === REAUTHENTICATION_OPERATION.disconnectMessagingConnection) return { kind: "status", text: LIFECYCLE_COPY.historical };
  if (operation.type === REAUTHENTICATION_OPERATION.configureMessagingConnection) return { kind: "status", text: RESOURCE_COPY.recovered };
  return { kind: "status", text: COPY.saved };
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Recovered original reference. @param operation - Completed original. @returns Nothing after reconciling it with the current configuration. */
async function reconcileRecoveredOriginal(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent, operation: CompletedOperation): Promise<void> {
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, COPY.pending); return; }
  if (operation.type === REAUTHENTICATION_OPERATION.diagnoseMessagingConnection && operation.result.outcome === VERIFICATION_ISSUANCE_OUTCOME.issued && !rememberDiagnostic(context, operation.operationId, operation.result)) return;
  applyConfiguration(context, current.value); resetConfirmations(context);
  if (retainIntent(context, null)) emitFeedback(context, recoveredOriginalFeedback(context, pending, operation, current.value));
  context.setPhase(PHASE.idle);
}

/** @param context - Current render facts. @param pending - Unresolved original. @param confirmedAbsent - Whether the registry confirmed it absent. @param observedAt - Instant of this read. @returns Whether a test was absent for the whole window and can stop being followed. */
function trackDiagnosticAbsence(context: ConnectionsContext, pending: MessagingConnectionsPendingIntent, confirmedAbsent: boolean, observedAt: number): boolean {
  if (!isDiagnosticIntent(pending)) return false;
  if (!confirmedAbsent) { context.firstDiagnosticAbsence.current = null; return false; }
  const firstObservedAt = context.firstDiagnosticAbsence.current?.operationId === pending.operationId ? context.firstDiagnosticAbsence.current.observedAt : null;
  if (firstObservedAt === null) context.firstDiagnosticAbsence.current = { operationId: pending.operationId, observedAt };
  return observedAt - diagnosticAbsenceSince(pending, firstObservedAt, observedAt) >= MESSAGING_DIAGNOSTIC_ABSENT_ARCHIVE_AFTER_MS;
}

/** @param confirmedAbsent - Whether the registry confirmed the test absent. @param archivable - Whether it was absent for the whole window. @returns The persistent explanation of a followed test. */
function diagnosticRecoveryNotice(confirmedAbsent: boolean, archivable: boolean): string {
  if (!confirmedAbsent) return DIAGNOSTIC_RECOVERY_COPY.started;
  return archivable ? DIAGNOSTIC_RECOVERY_COPY.absent : DIAGNOSTIC_RECOVERY_COPY.absentWaiting;
}

/** A test is never resumed. Only a confirmed absence that lasted the whole window is its read result (no billable send), so only then can it stop being followed; a started original keeps blocking. @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Unresolved original. @param confirmedAbsent - Whether the registry confirmed it absent. @returns Nothing after offering its resume or archive. */
async function followUnresolvedOriginal(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent, confirmedAbsent: boolean): Promise<void> {
  const diagnosticArchivable = trackDiagnosticAbsence(context, pending, confirmedAbsent, Date.now());
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { context.setCanResume(false); holdPending(context, COPY.pending); return; }
  applyConfiguration(context, current.value); context.setResumeConfirmed(false); context.setArchiveConfirmed(false);
  const leader = current.value.audience === TRIBE_MEMBER_ROLE.leader;
  if (isDiagnosticIntent(pending)) { context.setCanResume(false); context.setCanArchive(diagnosticArchivable && leader); context.setNotice(diagnosticRecoveryNotice(confirmedAbsent, diagnosticArchivable)); }
  else { context.setCanResume(Boolean(pending.original)); context.setCanArchive(leader); context.setNotice(pending.original ? RECOVERY_COPY.originalUnconfirmed : RECOVERY_COPY.originalMissing); }
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Original reference. @returns Nothing after reconciling, following or keeping the original. */
async function runRecovery(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const result = await context.client.operation(ready.slug, pending.operationId, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (result.status === "ready" && result.value.type === pending.type && result.value.state === OPERATION_STATE.completed) { await reconcileRecoveredOriginal(context, { ready, controller }, pending, result.value); return; }
  if (result.status === "ready" && result.value.type === pending.type && result.value.state === OPERATION_STATE.started || result.status === "failed" && result.code === MESSAGING_ERROR_CODE.resourceUnavailable) { await followUnresolvedOriginal(context, { ready, controller }, pending, result.status === "failed"); return; }
  context.setCanResume(false); holdPending(context, COPY.pending);
}

/** @param context - Current render facts. @returns Nothing after readonly reconciliation of the original reference, never a retry of the key. */
export async function recoverOriginal(context: ConnectionsContext): Promise<void> {
  const { ready, pending } = context;
  if (!ready || !pending || context.busy.current) return;
  toastMessagingRead(await collectFeedback(context, async () => {
    const controller = beginObservation(context); context.setPhase(PHASE.recovering); context.setApiKey(""); context.setCanResume(false); context.setCanArchive(false); context.setArchiveConfirmed(false); context.setResumeConfirmed(false);
    try { await runRecovery(context, { ready, controller }, pending); } finally { endObservation(context); }
  }));
}

/** Values and effect-scoped callbacks the mount restoration reads. */
export type ConnectionsRestoration = Pick<ConnectionsContext, "client" | "store" | "mounted" | "setApiKey" | "setPhase" | "setNotice" | "setHistory" | "setDiagnosticReferences" | "setPending" | "setConfiguration" | "setObservedAt" | "setCurrentReadFailed" | "setCurrentStepId"> & {
  ready: ConnectionsReady; setSecurityOpen: (value: boolean) => void; checkViewer: (signal: AbortSignal) => Promise<boolean>; acceptIssuance: (result: IssuedDiagnostic) => void;
};

/** @param restoration - Mount restoration scope. @param signal - Mount lifetime. @returns Whether the restoration may continue after an awaited reply. */
async function restorationCurrent(restoration: ConnectionsRestoration, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || !restoration.mounted.current) return false;
  return restoration.checkViewer(signal);
}

/** @param restoration - Mount restoration scope. @param signal - Mount lifetime. @param reference - Issued test kept across a reload. @returns Whether the restoration may continue, after reopening a test that still waits for its code. */
async function restoreIssuedDiagnostic(restoration: ConnectionsRestoration, signal: AbortSignal, reference: MessagingDiagnosticObservationReference): Promise<boolean> {
  const { ready, client } = restoration;
  const original = await client.operation(ready.slug, reference.operationId, signal);
  if (!await restorationCurrent(restoration, signal)) return false;
  const issued = issuedOriginalResult(original, reference);
  if (!issued) { toastMessagingRead({ kind: "alert", text: DIAGNOSTIC_COPY.pending }); return true; }
  const current = await client.read(ready.slug, signal);
  if (!await restorationCurrent(restoration, signal)) return false;
  if (current.status !== "ready") { toastMessagingRead({ kind: "alert", text: DIAGNOSTIC_COPY.pending }); return true; }
  applyConfiguration(restoration, current.value);
  if (!candidateMatches(current.value, reference.connectionId, reference.configurationVersion)) { toastMessagingRead({ kind: "status", text: DIAGNOSTIC_COPY.originalHistorical }); return true; }
  restoration.acceptIssuance(issued);
  if (!isMessagingDiagnosticSettled(issued, current.value.audience === TRIBE_MEMBER_ROLE.leader ? current.value.candidate : null)) { restoration.setCurrentStepId(messagingConnectionsStepId(STEP_KIND.test, issued.channel)); restoration.setSecurityOpen(false); }
  return true;
}

/** @param restoration - Mount restoration scope. @param signal - Mount lifetime. @returns Whether the restoration may continue, after reading a snapshot restored by Atrás once. */
async function refreshRestoredSnapshot(restoration: ConnectionsRestoration, signal: AbortSignal): Promise<boolean> {
  // A snapshot restored by Atrás may predate a change saved on another page (Países y cupos), so read the current state once.
  const current = await restoration.client.read(restoration.ready.slug, signal);
  if (!await restorationCurrent(restoration, signal)) return false;
  if (current.status === "ready") applyConfiguration(restoration, current.value);
  return true;
}

/** @param restoration - Mount restoration scope. @param signal - Mount lifetime. @returns Nothing after restoring references and the current view once the viewer is checked. */
export async function restoreConnections(restoration: ConnectionsRestoration, signal: AbortSignal): Promise<void> {
  const { ready, client, store } = restoration;
  const viewer = await client.viewer(signal);
  if (signal.aborted || !restoration.mounted.current) return;
  if (viewer.status !== "ready" || viewer.value?.id !== ready.viewerId) { restoration.setApiKey(""); restoration.setPhase(PHASE.unavailable); restoration.setNotice(COPY.viewerChanged); return; }
  restoration.setHistory(store.history(ready.viewerId, ready.slug)); restoration.setDiagnosticReferences(store.diagnostics(ready.viewerId, ready.slug));
  const intent = store.read(ready.viewerId, ready.slug);
  if (intent) restoration.setPending(intent);
  else if (ready.configuration.audience === TRIBE_MEMBER_ROLE.leader) {
    const reference = store.diagnostic(ready.viewerId, ready.slug);
    if (reference && !await restoreIssuedDiagnostic(restoration, signal, reference)) return;
    if (!reference && Date.now() - Date.parse(ready.renderedAt) > MESSAGING_CONNECTIONS_RESTORED_SNAPSHOT_MAX_AGE_MS && !await refreshRestoredSnapshot(restoration, signal)) return;
  }
  restoration.setPhase(PHASE.idle);
}

/** @param name - Typed connection name. @param apiKey - Typed key. @param confirmed - Explicit consent. @returns The field errors of the key form. */
function credentialFieldErrors(name: string, apiKey: string, confirmed: boolean): CredentialFieldErrors {
  const errors: CredentialFieldErrors = {};
  if (!name.trim()) errors.name = COPY.nameRequired;
  else if (name.trim().length > ADMISSION_LIMIT.displayNameCharacters) errors.name = COPY.nameTooLong;
  if (!apiKey.trim()) errors.apiKey = COPY.keyRequired;
  if (!confirmed) errors.confirmation = COPY.confirmationRequired;
  return errors;
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @returns Nothing after one original key write; a lost response preserves the reference but erases the key. */
async function runSave(context: ConnectionsContext, { ready, controller }: OperationRun): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.saveMessagingCredentials, operationId: newAdmissionOperationId(), original: { name: context.name.trim() } };
  if (!retainIntent(context, intent)) return;
  const result = await context.client.create(ready.slug, { operationId: intent.operationId, confirmed: true, providerId: MESSAGING_INITIAL_PROVIDER_ID, name: context.name.trim(), apiKey: context.apiKey.trim() }, controller.signal);
  if (controller.signal.aborted || !context.mounted.current) return;
  context.setApiKey("");
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  if (result.status === "ready" && result.value.state === OPERATION_STATE.completed) { applyCreated(context, result.value.result); return; }
  settleWriteFailure(context, result, COPY.pending);
}

/** @param context - Current render facts. @returns Nothing after field validation and a single explicit original write; lost responses preserve reference but erase the key. */
export async function saveConnection(context: ConnectionsContext): Promise<void> {
  const { ready } = context;
  if (!ready || context.busy.current || context.phase !== PHASE.idle || context.pending || context.needsCurrent || context.configuration?.audience !== "leader") return;
  const errors = credentialFieldErrors(context.name, context.apiKey, context.confirmed);
  context.setFieldErrors(errors);
  if (Object.keys(errors).length) { context.setValidationAttempt((attempt) => attempt + 1); return; }
  await toastMessagingWrite(COPY.writing, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.saveConnection);
    try { await runSave(context, { ready, controller }); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param candidate - Checked candidate. @param result - Completed check. @returns Nothing after reconciling the check with the current lifecycle. */
async function reconcileValidation(context: ConnectionsContext, { ready, controller }: OperationRun, candidate: ConnectionCandidate, result: { configurationVersion: number; failureCode?: keyof typeof MESSAGING_ERROR_MESSAGE | null }): Promise<void> {
  if (result.configurationVersion !== candidate.configurationVersion) { holdPending(context, CHECK_COPY.pending); return; }
  // Credential changes can retire candidate readiness; the minimal result cannot reconstruct the current lifecycle.
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, CHECK_COPY.pending); return; }
  applyConfiguration(context, current.value);
  if (retainIntent(context, null)) emitFeedback(context, result.failureCode ? { kind: "alert", text: MESSAGING_ERROR_MESSAGE[result.failureCode] } : { kind: "status", text: CHECK_COPY.checked });
}

/** A completed check that failed (rejected key, test account) still advanced the candidate: show its current state instead of the stale one. @param context - Current render facts. @param run - Route snapshot and current observation. @returns Whether the operation may continue. */
async function refreshAfterRejectedValidation(context: ConnectionsContext, { ready, controller }: OperationRun): Promise<boolean> {
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return false;
  if (current.status === "ready") applyConfiguration(context, current.value);
  else if (current.status === "failed" && current.code === MESSAGING_ERROR_CODE.connectionConflict) context.setNeedsCurrent(true);
  else context.setCurrentReadFailed(true);
  return true;
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param candidate - Candidate to check. @returns Nothing after one explicit candidate CAS check and current lifecycle reconciliation. */
async function runValidation(context: ConnectionsContext, { ready, controller }: OperationRun, candidate: ConnectionCandidate): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.validateMessagingConnection, operationId: newAdmissionOperationId(), original: { connectionId: candidate.id, configurationVersion: candidate.configurationVersion, expectedVersion: candidate.version } };
  if (!retainIntent(context, intent)) return;
  context.setValidationConfirmed(false); context.resourceController.resetConfirmation(); context.activationController.reset(); context.lifecycleController.reset();
  const outcome = await context.client.validate(ready.slug, candidate.id, { operationId: intent.operationId, expectedVersion: candidate.version, confirmed: true }, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed) { await reconcileValidation(context, { ready, controller }, candidate, outcome.value.result); return; }
  if (outcome.status !== "failed" || outcome.uncertain) { holdPending(context, CHECK_COPY.pending); return; }
  if (outcome.code === MESSAGING_ERROR_CODE.connectionConflict) context.setNeedsCurrent(true);
  else if (!await refreshAfterRejectedValidation(context, { ready, controller })) return;
  if (retainIntent(context, null)) emitFeedback(context, { kind: "alert", text: outcome.message });
}

/** @param context - Current render facts. @returns Nothing after one explicit candidate CAS check and current lifecycle reconciliation; it cannot activate a channel. */
export async function validateCredential(context: ConnectionsContext): Promise<void> {
  const { ready, candidate } = context;
  if (!ready || !candidate || !context.validationConfirmed || !isIdle(context)) return;
  await toastMessagingWrite(CHECK_COPY.checking, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); context.setApiKey(""); startWriting(context, WRITE_ACTION.validateCredential);
    try { await runValidation(context, { ready, controller }, candidate); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param candidate - Configured candidate. @param references - Chosen references. @returns Nothing after the original configuration and authoritative metadata reconciliation. */
async function runChannelConfiguration(context: ConnectionsContext, { ready, controller }: OperationRun, candidate: ConnectionCandidate, references: ResolvedChannelReferences): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.configureMessagingConnection, operationId: newAdmissionOperationId(), original: { connectionId: candidate.id, configurationVersion: candidate.configurationVersion, expectedVersion: candidate.version, ...references } };
  if (!retainIntent(context, intent)) return;
  const outcome = await context.resourcesClient.configure({ slug: ready.slug, connectionId: candidate.id, configurationVersion: candidate.configurationVersion }, { ...references, operationId: intent.operationId, expectedVersion: candidate.version, confirmed: true }, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status !== "ready" || outcome.value.state !== OPERATION_STATE.completed) { settleWriteFailure(context, outcome, RESOURCE_COPY.pending); return; }
  // The minimal write cannot reconstruct all capability timestamps. Read the same owner instead of guessing them or refreshing the route.
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, RESOURCE_COPY.pending); return; }
  applyConfiguration(context, current.value);
  if (retainIntent(context, null)) emitFeedback(context, { kind: "status", text: outcome.value.result.changed ? RESOURCE_COPY.saved : RESOURCE_COPY.unchanged });
}

/** @param context - Current render facts. @param draft - Explicit chosen references already confirmed by the controlled form. @returns Nothing after original versioned configuration and authoritative metadata reconciliation, without sending a message. */
export async function configureChannel(context: ConnectionsContext, draft: MessagingChannelDraft): Promise<void> {
  const { ready, candidate } = context, validation = validateMessagingChannelDraft(draft);
  if (!ready || !candidate || !validation.valid || !isIdle(context)) return;
  await toastMessagingWrite(RESOURCE_COPY.writing, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.configureChannel); resetConfirmations(context);
    try { await runChannelConfiguration(context, { ready, controller }, candidate, validation.references); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param candidate - Candidate to select. @returns Nothing after one original selection and an authoritative current read. */
async function runActivation(context: ConnectionsContext, { ready, controller }: OperationRun, candidate: ConnectionCandidate): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.activateMessagingConnection, operationId: newAdmissionOperationId(), original: { connectionId: candidate.id, configurationVersion: candidate.configurationVersion, expectedVersion: candidate.version } };
  if (!retainIntent(context, intent)) return;
  const outcome = await context.activationClient.activate({ slug: ready.slug, connectionId: candidate.id, configurationVersion: candidate.configurationVersion }, { operationId: intent.operationId, expectedVersion: candidate.version, confirmed: true }, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status !== "ready" || outcome.value.state !== OPERATION_STATE.completed) { settleWriteFailure(context, outcome, ACTIVATION_COPY.pending); return; }
  // Selection can update dependent policy references; reconcile this owner's snapshot instead of inventing cross-view facts.
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, ACTIVATION_COPY.pending); return; }
  applyConfiguration(context, current.value);
  if (retainIntent(context, null)) emitFeedback(context, { kind: "status", text: selectedMatches(current.value, outcome.value.result.id, outcome.value.result.configurationVersion) ? ACTIVATION_COPY.activated : ACTIVATION_COPY.historical });
}

/** @param context - Current render facts. @returns Nothing after one explicit original candidate selection and an authoritative current read; no SDK or route refresh is used. */
export async function activateCandidate(context: ConnectionsContext): Promise<void> {
  const { ready, candidate } = context;
  if (!ready || !candidate || !isIdle(context)) return;
  await toastMessagingWrite(ACTIVATION_COPY.activating, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.activateCandidate); context.setApiKey(""); context.resourceController.resetConfirmation(); context.activationController.reset(); context.lifecycleController.reset(); context.diagnosticController.clearPrivate();
    try { await runActivation(context, { ready, controller }, candidate); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param operationId - Original issuance UUID. @param result - Completed issuance. @returns Nothing after keeping an issued test and announcing the outcome. */
function acceptIssuedOutcome(context: ConnectionsContext, operationId: string, result: ConnectionDiagnosticIssueResult): void {
  if (result.outcome === VERIFICATION_ISSUANCE_OUTCOME.issued) {
    if (!rememberDiagnostic(context, operationId, result)) return;
    context.diagnosticController.acceptIssuance(result);
  }
  if (retainIntent(context, null)) emitFeedback(context, result.outcome === VERIFICATION_ISSUANCE_OUTCOME.issued ? { kind: "status", text: DIAGNOSTIC_COPY.issued } : { kind: "alert", text: MESSAGING_ERROR_MESSAGE[result.code] });
}

/** A test send: its destination, the challenge an explicit resend replaces, and the candidate it tests. */
type DiagnosticIssue = { candidate: ConnectionCandidate; destination: MessagingDiagnosticDestination; currentChallengeId?: string };

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param issue - Test to send. @returns Original issuance or protected uncertainty; no automatic retry. */
async function runIssue(context: ConnectionsContext, { ready, controller }: OperationRun, { candidate, destination, currentChallengeId }: DiagnosticIssue): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.diagnoseMessagingConnection, operationId: newAdmissionOperationId(), original: { connectionId: candidate.id, configurationVersion: candidate.configurationVersion, expectedVersion: candidate.version, channel: destination.channel }, startedAt: new Date().toISOString() };
  if (!retainIntent(context, intent)) return;
  const outcome = await context.diagnosticClient.issue({ slug: ready.slug, connectionId: candidate.id, configurationVersion: candidate.configurationVersion }, { ...destination, operationId: intent.operationId, expectedVersion: candidate.version, confirmed: true, ...(currentChallengeId ? { currentChallengeId } : {}) }, controller.signal);
  context.diagnosticController.clearPrivate();
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed) { acceptIssuedOutcome(context, intent.operationId, outcome.value.result); return; }
  settleWriteFailure(context, outcome, DIAGNOSTIC_COPY.pending);
}

/** @param context - Current render facts. @param destination - Explicit normalized destination/consent from the diagnostic form. @param currentChallengeId - Only an explicit resend of an issued challenge. @returns Original issuance or protected uncertainty; no automatic retry. */
export async function issueDiagnostic(context: ConnectionsContext, destination: MessagingDiagnosticDestination, currentChallengeId?: string): Promise<void> {
  if (context.diagnosticReferences.length >= MESSAGING_CONNECTION_HISTORY_LIMIT) { toastMessagingRead({ kind: "alert", text: DIAGNOSTIC_COPY.historyFull }); return; }
  const { ready, candidate } = context;
  if (!ready || !candidate || !isIdle(context)) return;
  context.activationController.reset(); context.lifecycleController.reset();
  await toastMessagingWrite(DIAGNOSTIC_COPY.issuing, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, currentChallengeId ? WRITE_ACTION.resendDiagnostic : WRITE_ACTION.issueDiagnostic);
    try { await runIssue(context, { ready, controller }, { candidate, destination, currentChallengeId }); } finally { endObservation(context); }
  }));
}

/** @param result - Completed verification. @param applies - Whether it belongs to the current candidate. @returns Its announcement. */
function verificationFeedback(result: ConnectionDiagnosticSnapshot, applies: boolean): MessagingConnectionsFeedback {
  if (result.outcome !== CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified) return { kind: "alert", text: MESSAGING_ERROR_MESSAGE[result.code] };
  return { kind: "status", text: applies ? DIAGNOSTIC_COPY.verified : DIAGNOSTIC_COPY.originalHistorical };
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param diagnostic - Safe original issued tuple. @param code - Received ephemeral code. @returns Nothing after the original verification and current metadata reconciliation. */
async function runVerification(context: ConnectionsContext, { ready, controller }: OperationRun, diagnostic: IssuedDiagnostic, code: string): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const intent: MessagingConnectionsPendingIntent = { type: REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic, operationId: newAdmissionOperationId(), original: { connectionId: diagnostic.connectionId, configurationVersion: diagnostic.connectionVersion, diagnosticId: diagnostic.diagnosticId, channel: diagnostic.channel }, startedAt: new Date().toISOString() };
  if (!retainIntent(context, intent)) return;
  const outcome = await context.diagnosticClient.verify({ slug: ready.slug, connectionId: diagnostic.connectionId, configurationVersion: diagnostic.connectionVersion, diagnosticId: diagnostic.diagnosticId, channel: diagnostic.channel }, { operationId: intent.operationId, confirmed: true, verificationCode: code }, controller.signal);
  context.diagnosticController.clearPrivate();
  if (!await stillCurrent(context, controller)) return;
  if (outcome.status !== "ready" || outcome.value.state !== OPERATION_STATE.completed) {
    if (outcome.status === "failed" && !outcome.uncertain) { if (retainIntent(context, null)) emitFeedback(context, { kind: "alert", text: outcome.message }); }
    else holdPending(context, DIAGNOSTIC_COPY.pending);
    return;
  }
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready") { holdPending(context, DIAGNOSTIC_COPY.pending); return; }
  applyConfiguration(context, current.value);
  const applies = candidateMatches(current.value, diagnostic.connectionId, diagnostic.connectionVersion);
  if (applies) context.diagnosticController.acceptVerification(outcome.value.result);
  if (retainIntent(context, null)) emitFeedback(context, verificationFeedback(outcome.value.result, applies));
}

/** @param candidate - Current candidate. @param diagnostic - Issued test. @returns Whether the test belongs to exactly the current candidate configuration. */
function testsCandidate(candidate: ConnectionCandidate, diagnostic: IssuedDiagnostic): boolean {
  return candidate.id === diagnostic.connectionId && candidate.configurationVersion === diagnostic.connectionVersion;
}

/** @param context - Current render facts. @param diagnostic - Safe original issued tuple. @param code - Received ephemeral code, never saved to history. @returns Local capability confirmation and current metadata, without another send. */
export async function verifyDiagnostic(context: ConnectionsContext, diagnostic: IssuedDiagnostic, code: string): Promise<void> {
  const { ready, candidate } = context;
  if (!ready || !candidate || !isIdle(context) || !testsCandidate(candidate, diagnostic)) return;
  context.activationController.reset(); context.lifecycleController.reset();
  await toastMessagingWrite(DIAGNOSTIC_COPY.verifying, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.verifyDiagnostic);
    try { await runVerification(context, { ready, controller }, diagnostic, code); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param diagnostic - Original associated delivery. @returns Transport facts only, never local code possession or another send. */
export async function readDiagnosticDelivery(context: ConnectionsContext, diagnostic: IssuedDiagnostic): Promise<void> {
  const { ready, candidate } = context;
  if (!ready || !candidate || context.pending || !testsCandidate(candidate, diagnostic)) return;
  toastMessagingRead(await collectFeedback(context, () => observeResource(context, (signal) => context.diagnosticClient.delivery({ slug: ready.slug, deliveryId: diagnostic.deliveryId, channel: diagnostic.channel }, signal), (outcome) => {
    if (outcome.status === "ready") context.diagnosticController.acceptDelivery(outcome.value);
    else if (outcome.status === "failed") emitFeedback(context, { kind: "alert", text: outcome.message });
  })));
}

/** @param context - Current render facts. @param ready - Route snapshot. @param pending - Original to replay with its preserved public input. @param signal - Current observation. @returns The answer of the replayed original. */
async function replayOriginal(context: ConnectionsContext, ready: ConnectionsReady, pending: MessagingConnectionsPendingIntent, signal: AbortSignal) {
  if (!pending.original) return null;
  if (pending.type === REAUTHENTICATION_OPERATION.saveMessagingCredentials) return context.client.create(ready.slug, { operationId: pending.operationId, confirmed: true, providerId: MESSAGING_INITIAL_PROVIDER_ID, name: pending.original.name, apiKey: context.apiKey.trim() }, signal);
  if (pending.type === REAUTHENTICATION_OPERATION.validateMessagingConnection) return context.client.validate(ready.slug, pending.original.connectionId, { operationId: pending.operationId, confirmed: true, expectedVersion: pending.original.expectedVersion }, signal);
  if (pending.type === REAUTHENTICATION_OPERATION.activateMessagingConnection) return context.activationClient.activate({ slug: ready.slug, connectionId: pending.original.connectionId, configurationVersion: pending.original.configurationVersion }, { operationId: pending.operationId, expectedVersion: pending.original.expectedVersion, confirmed: true }, signal);
  if (pending.type === REAUTHENTICATION_OPERATION.suspendMessagingConnection) return context.lifecycleClient.suspend({ slug: ready.slug, connectionId: pending.original.connectionId }, { operationId: pending.operationId, expectedVersion: pending.original.expectedVersion, confirmed: true, reason: pending.original.reason }, signal);
  if (pending.type === REAUTHENTICATION_OPERATION.disconnectMessagingConnection) return context.lifecycleClient.disconnect({ slug: ready.slug, connectionId: pending.original.connectionId }, { operationId: pending.operationId, expectedVersion: pending.original.expectedVersion, confirmed: true }, signal);
  if (pending.type !== REAUTHENTICATION_OPERATION.configureMessagingConnection) return null;
  const { connectionId, configurationVersion, ...original } = pending.original;
  return context.resourcesClient.configure({ slug: ready.slug, connectionId, configurationVersion }, { ...original, operationId: pending.operationId, confirmed: true }, signal);
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Original to replay. @returns Nothing after one explicit replay; its result is observed separately. */
async function runResume(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const outcome = await replayOriginal(context, ready, pending, controller.signal);
  context.setApiKey("");
  if (!outcome || !await stillCurrent(context, controller)) return;
  // Observe the original separately; a successful replay is never substituted for the current view.
  if (outcome.status === "ready" && outcome.value.state === OPERATION_STATE.completed || outcome.status === "failed" && outcome.uncertain) { context.setNotice(RECOVERY_COPY.consultAgain); emitFeedback(context, { kind: "status", text: RECOVERY_COPY.resumed }); }
  else emitFeedback(context, { kind: "alert", text: outcome.status === "failed" ? outcome.message : COPY.pending });
}

/** @param context - Current render facts. @param pending - Current original. @returns Whether the original may be replayed now: confirmed again, resumable, never a test, and with the key a key save needs. */
function canReplay(context: ConnectionsContext, pending: MessagingConnectionsPendingIntent | null): pending is MessagingConnectionsPendingIntent {
  if (!pending?.original || !context.canResume || !context.resumeConfirmed || context.busy.current || context.phase !== PHASE.idle || isDiagnosticIntent(pending)) return false;
  return pending.type !== REAUTHENTICATION_OPERATION.saveMessagingCredentials || Boolean(context.apiKey.trim());
}

/** @param context - Current render facts. @returns Nothing after an explicit original replay using preserved public input and renewed consent; keys remain ephemeral and no new UUID is created. */
export async function resumeOriginal(context: ConnectionsContext): Promise<void> {
  const { ready, pending } = context;
  if (!ready || !canReplay(context, pending)) return;
  await toastMessagingWrite(RECOVERY_COPY.resuming, () => collectFeedback(context, async () => {
    if (!pending.original) return;
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.resumeOriginal); context.setCanResume(false); context.setCanArchive(false); context.setArchiveConfirmed(false); context.setResumeConfirmed(false);
    try { await runResume(context, { ready, controller }, pending); } finally { endObservation(context); }
  }));
}

/** A test stops being followed only while its original is still confirmed absent: read it again right before, since an earlier absence is not enough. @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Followed test. @returns Whether it is still confirmed absent. */
async function recheckDiagnosticAbsence(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent): Promise<boolean> {
  const original = await context.client.operation(ready.slug, pending.operationId, controller.signal);
  if (!await stillCurrent(context, controller)) return false;
  if (original.status === "failed" && original.code === MESSAGING_ERROR_CODE.resourceUnavailable) return true;
  context.setCanArchive(false);
  const text = original.status === "ready" ? DIAGNOSTIC_COPY.originalAppeared : DIAGNOSTIC_COPY.originalRecheckFailed;
  context.setNotice(text); emitFeedback(context, { kind: "alert", text });
  return false;
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @param pending - Original to archive. @returns Nothing after archiving it with a fresh authorized current read. */
async function runArchive(context: ConnectionsContext, { ready, controller }: OperationRun, pending: MessagingConnectionsPendingIntent): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  if (isDiagnosticIntent(pending) && !await recheckDiagnosticAbsence(context, { ready, controller }, pending)) return;
  const current = await readFreshConfiguration(context, { ready, controller });
  if (!current) return;
  if (current.status !== "ready" || current.value.audience !== TRIBE_MEMBER_ROLE.leader) { emitFeedback(context, { kind: "alert", text: CHECK_COPY.currentUnavailable }); return; }
  if (!context.store.archive(ready.viewerId, ready.slug, pending)) { emitFeedback(context, { kind: "alert", text: RECOVERY_COPY.archiveFailed }); return; }
  context.setHistory((previous) => appendArchivedIntent(previous, pending)); applyConfiguration(context, current.value);
  if (retainIntent(context, null)) { context.setNeedsCurrent(false); emitFeedback(context, { kind: "status", text: RECOVERY_COPY.archived }); }
}

/** @param context - Current render facts. @returns Nothing after explicit local archiving and a fresh authorized current read; no backend work is cancelled or rewritten. */
export async function archiveOriginal(context: ConnectionsContext): Promise<void> {
  const { ready, pending } = context;
  if (!ready || !pending || !context.canArchive || !context.archiveConfirmed || context.busy.current || context.phase !== PHASE.idle) return;
  await toastMessagingWrite(RECOVERY_COPY.archiving, () => collectFeedback(context, async () => {
    const controller = beginObservation(context); startWriting(context, WRITE_ACTION.archiveOriginal); context.setApiKey(""); context.setResumeConfirmed(false); context.setArchiveConfirmed(false);
    try { await runArchive(context, { ready, controller }, pending); } finally { endObservation(context); }
  }));
}

/** @param context - Current render facts. @param original - Preserved own history entry. @returns Nothing after restoring the same UUID for readonly observation, never a new write. */
export function restoreHistory(context: ConnectionsContext, original: MessagingConnectionsPendingIntent): void {
  if (!context.ready || context.busy.current || context.pending || context.phase !== PHASE.idle) return;
  resetConfirmations(context); retainIntent(context, original);
}

/** @param context - Current render facts. @param run - Route snapshot and current observation. @returns Nothing after one current read; only a reported conflict proves a change. */
async function runCurrentRead(context: ConnectionsContext, { ready, controller }: OperationRun): Promise<void> {
  if (!await checkConnectionsViewer(context, controller.signal)) return;
  const current = await context.client.read(ready.slug, controller.signal);
  if (!await stillCurrent(context, controller)) return;
  if (current.status === "ready") { applyConfiguration(context, current.value); context.setNeedsCurrent(false); emitFeedback(context, { kind: "status", text: CHECK_COPY.currentRead }); return; }
  // Only a reported conflict proves a change; a timeout or an unavailable read keeps the known state and its own retry beside the button.
  if (current.status === "failed" && current.code === MESSAGING_ERROR_CODE.connectionConflict) context.setNeedsCurrent(true); else context.setCurrentReadFailed(true);
}

/** @param context - Current render facts. @returns Nothing after an explicit current metadata read; a stale CAS cannot be silently retried, and a failed read keeps the known state instead of claiming a change. */
export async function readCurrentConnection(context: ConnectionsContext): Promise<void> {
  const { ready } = context;
  if (!ready || context.busy.current || context.phase !== PHASE.idle) return;
  toastMessagingRead(await collectFeedback(context, async () => {
    const controller = beginObservation(context); context.setCurrentReadFailed(false); context.setReadingCurrent(true); resetConfirmations(context); context.setPhase(PHASE.recovering); context.setCanResume(false); context.setCanArchive(false); context.setArchiveConfirmed(false); context.setResumeConfirmed(false);
    try { await runCurrentRead(context, { ready, controller }); }
    finally { context.busy.current = false; if (context.mounted.current) { context.setReadingCurrent(false); context.setPhase(settledConnectionsPhase); } }
  }));
}
