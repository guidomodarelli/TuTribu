"use client";
/** Owns ephemeral key entry, current viewer checks and original-result recovery; the presenter never owns HTTP/auth/storage. @module messaging-connections-container */
import {useCallback,useEffect,useEffectEvent,useRef,useState} from "react";
import {NotificationRecoveryContainer} from "./notification-recovery-container";
import {Button} from "@golfo/ui";
import {toastMessagingRead,toastMessagingWrite,type MessagingConnectionsFeedback} from "./messaging-connections-feedback";
import {MessagingConnectionDiagnostic} from "@/components/academy-admissions/messaging-connection-diagnostic";
import {MessagingDiagnosticHistory} from "@/components/academy-admissions/messaging-diagnostic-history";
import {MessagingConnectionActivation} from "@/components/academy-admissions/messaging-connection-activation";
import {useMessagingActivationController} from "./messaging-activation-controller";
import {messagingActivationBrowserClient} from "@/lib/messaging/messaging-activation-api-client";
import type {MessagingActivationBrowserClient} from "@/src/modules/messaging/application/ports/messaging-activation-browser-client";
import type {MessagingLifecycleBrowserClient} from "@/src/modules/messaging/application/ports/messaging-lifecycle-browser-client";
import {messagingLifecycleBrowserClient} from "@/lib/messaging/messaging-lifecycle-api-client";
import {MESSAGING_KEY_REPLACEMENT_COPY as REPLACEMENT_COPY,MESSAGING_LIFECYCLE_UI_COPY as LIFECYCLE_COPY} from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import {MessagingCandidateKeyReplacement} from "@/components/academy-admissions/messaging-candidate-key-replacement";
import {MESSAGING_CREDENTIAL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {MessagingConnectionLifecycle,type MessagingLifecycleConnectionView} from "@/components/academy-admissions/messaging-connection-lifecycle";
import {useMessagingLifecycleController} from "./messaging-lifecycle-controller";
import type {MessagingConnectionSuspensionInput} from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import {MESSAGING_CONNECTION_SECURITY_REASON} from "@/src/modules/messaging/constants/messaging-connection-security";
import {MESSAGING_ACTIVATION_UI_COPY as ACTIVATION_COPY} from "@/src/modules/messaging/constants/messaging-activation-browser";
import {useMessagingDiagnosticController} from "./messaging-diagnostic-controller";
import {messagingDiagnosticBrowserClient} from "@/lib/messaging/messaging-diagnostic-api-client";
import type {MessagingDiagnosticBrowserClient} from "@/src/modules/messaging/application/ports/messaging-diagnostic-browser-client";
import type {MessagingDiagnosticDestination} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import type {ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import {MESSAGING_DIAGNOSTIC_UI_COPY as DIAGNOSTIC_COPY} from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import {VERIFICATION_ISSUANCE_OUTCOME} from "@/src/modules/academy-admissions/constants/verification-issuance";
import {CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME} from "@/src/modules/messaging/constants/connection-diagnostic";
import {MessagingOriginalRecovery} from "@/components/academy-admissions/messaging-original-recovery";
import {MessagingConnectionResources} from "@/components/academy-admissions/messaging-connection-resources";
import {useMessagingResourceController} from "./messaging-resource-controller";
import {messagingResourcesBrowserClient} from "@/lib/messaging/messaging-resources-api-client";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import {validateMessagingChannelDraft,type MessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {MESSAGING_RESOURCE_UI_COPY as RESOURCE_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {MessagingConnections} from "@/components/academy-admissions/messaging-connections";
import {MessagingConnectionsAttention,MessagingConnectionsPreservedAttempts,MessagingConnectionsStepNote,MessagingConnectionsUsageRequired,MessagingConnectionsWorkspace} from "@/components/academy-admissions/messaging-connections-workspace";
import {MESSAGING_USAGE_POLICY_STATE} from "@/src/modules/messaging/constants/messaging-limits";
import {MESSAGING_USAGE_SETTINGS_SEGMENT} from "@/src/modules/messaging/constants/messaging-usage";
import {isMessagingDiagnosticSettled,resolveMessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import {MESSAGING_CONNECTIONS_FLOW_COPY as FLOW_COPY,MESSAGING_CONNECTIONS_NEXT_STEP,MESSAGING_CONNECTIONS_STEP_KIND as STEP_KIND} from "@/src/modules/messaging/constants/messaging-connections-workspace";
import {messagingConnectionsActionStepId,messagingConnectionsStepId,resolveMessagingConnectionsFlow} from "@/src/modules/messaging/application/commands/messaging-connections-flow";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {AdmissionRouteError} from "@/components/academy-admissions/admission-route-error";
import type {MessagingConnectionsPageState} from "@/src/modules/messaging/application/results/messaging-connections-page-state";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingConnectionMutationResult} from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import type {MessagingConnectionsBrowserClient} from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import type {MessagingConnectionsIntentStore,MessagingConnectionsPendingIntent,MessagingDiagnosticObservationReference} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {messagingConnectionsBrowserClient} from "@/lib/messaging/messaging-connections-api-client";
import {messagingConnectionsIntentStore} from "@/lib/messaging/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_BROWSER_PHASE as PHASE,MESSAGING_CONNECTIONS_UI_COPY as COPY,MESSAGING_CREDENTIAL_CHECK_UI_COPY as CHECK_COPY,MESSAGING_CONNECTION_RECOVERY_UI_COPY as RECOVERY_COPY,MESSAGING_CONNECTIONS_WRITE_ACTION as WRITE_ACTION,type MessagingConnectionsWriteAction} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_INITIAL_PROVIDER_ID,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {newAdmissionOperationId} from "@/lib/academy-admissions/admission-draft";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_ERROR_MESSAGE,MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {MESSAGING_CONNECTION_HISTORY_LIMIT,MESSAGING_CONNECTIONS_RESTORED_SNAPSHOT_MAX_AGE_MS} from "@/src/modules/messaging/constants/messaging-connections-browser";

/** Own ports may be injected; real auth/shared UI remain the production defaults. */
type ContainerProps={initialState:MessagingConnectionsPageState;client?:MessagingConnectionsBrowserClient;store?:MessagingConnectionsIntentStore;resourcesClient?:MessagingResourcesBrowserClient;diagnosticClient?:MessagingDiagnosticBrowserClient;activationClient?:MessagingActivationBrowserClient;lifecycleClient?:MessagingLifecycleBrowserClient};
/** @param props - Guarded own SSR state and browser ports. @returns First safe connection step with incremental results, preserved original reference and no route refresh. */
export function MessagingConnectionsContainer({initialState,client=messagingConnectionsBrowserClient,store=messagingConnectionsIntentStore,resourcesClient=messagingResourcesBrowserClient,diagnosticClient=messagingDiagnosticBrowserClient,activationClient=messagingActivationBrowserClient,lifecycleClient=messagingLifecycleBrowserClient}:ContainerProps){
  const ready=initialState.kind==="ready"?initialState:null;
  /** The first tab follows the advisory next step of the server-rendered snapshot, so SSR and hydration agree. */
  /** Resuming opens the first pending step of the server-rendered snapshot (or Security when that is where it is resolved), so SSR and hydration agree. */
  const initialAction=ready?.configuration.audience===TRIBE_MEMBER_ROLE.leader?resolveMessagingConnectionsNextAction({...ready.configuration,observedAt:ready.renderedAt}):null;
  const[currentStepId,setCurrentStepId]=useState(()=>(initialAction&&messagingConnectionsActionStepId(initialAction))??messagingConnectionsStepId(STEP_KIND.activation));
  const[securityOpen,setSecurityOpen]=useState(()=>initialAction?.target?.kind==="security");
  /** Security opened by the next action manages the candidate it names, with retirement preselected; the leader still confirms. */
  const initialCandidate=ready?.configuration.audience===TRIBE_MEMBER_ROLE.leader?ready.configuration.candidate:null,initialLifecycleTarget=initialAction?.target?.kind==="security"&&initialCandidate?{id:initialCandidate.id,retire:true}:null;
  /** When the current configuration was observed: the SSR time first (deterministic hydration), then each authoritative read. */
  const[observedAt,setObservedAt]=useState(()=>ready?.renderedAt??new Date(0).toISOString());
  const[configuration,setConfiguration]=useState<MessagingConfigurationResult|null>(ready?.configuration??null),[name,setName]=useState(""),[apiKey,setApiKey]=useState(""),[confirmed,setConfirmed]=useState(false),[validationConfirmed,setValidationConfirmed]=useState(false),[needsCurrent,setNeedsCurrent]=useState(false),[canResume,setCanResume]=useState(false),[resumeConfirmed,setResumeConfirmed]=useState(false),[canArchive,setCanArchive]=useState(false),[archiveConfirmed,setArchiveConfirmed]=useState(false),[history,setHistory]=useState<MessagingConnectionsPendingIntent[]>([]),[phase,setPhase]=useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking),[notice,setNotice]=useState<string|null>(null),[fieldErrors,setFieldErrors]=useState<Partial<Record<"name"|"apiKey"|"confirmation",string>>>({}),[pending,setPending]=useState<MessagingConnectionsPendingIntent|null>(null);
  const busy=useRef(false),mounted=useRef(true),observation=useRef<AbortController|null>(null);
  /** Outcome of the serialized operation in flight; its toast is shown once the operation settles. */
  const report=useRef<MessagingConnectionsFeedback|null>(null);
  /** @param next - Operation outcome to announce when the current operation settles. @returns Nothing. */
  const emit=(next:MessagingConnectionsFeedback)=>{report.current=next;};
  /** @param text - Persistent explanation of an unconfirmed original, kept above the steps. @returns Nothing after also announcing the short failure once. */
  const holdPending=(text:string)=>{setNotice(text);emit({kind:"alert",text:COPY.unconfirmed});};
  /** @param run - One serialized operation that may emit its outcome. @returns That outcome, or null when it stays in the page. */
  const collectFeedback=async(run:()=>Promise<void>)=>{report.current=null;await run();const outcome=report.current;report.current=null;return outcome;};
  /** @param value - Authoritative own configuration. @returns Nothing after storing it with its observation time. */
  const applyConfiguration=(value:MessagingConfigurationResult)=>{setConfiguration(value);setObservedAt(new Date().toISOString());};
  /** The pressed write; it only counts while the writing phase lasts, so reads never show it. */
  const[writingAction,setWritingAction]=useState<MessagingConnectionsWriteAction|null>(null);
  /** @param action - Explicit control whose original write starts now. @returns Nothing after entering the shared writing phase. */
  const startWriting=(action:MessagingConnectionsWriteAction)=>{setWritingAction(action);setPhase(PHASE.writing);};
  const[recoveryBusy,setRecoveryBusy]=useState(false);
  /** @param active - Whether notification recovery owns the shared interaction lifetime. @returns Nothing after serializing sibling connection actions. */
  const recoveryBusyChanged=useCallback((active:boolean)=>{busy.current=active;setRecoveryBusy(active);},[]);
  const[diagnosticReferences,setDiagnosticReferences]=useState<MessagingDiagnosticObservationReference[]>([]);
  /** @param request - Explicit own read. @param settle - Local draft/page update after current viewer checks. @returns Nothing after one serialized observation, never an automatic retry. */
  async function observeResource<Value>(request:(signal:AbortSignal)=>Promise<MessagingUsageBrowserResult<Value>>,settle:(outcome:MessagingUsageBrowserResult<Value>)=>void):Promise<void>{
    if(!ready||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();
    try{if(!await checkViewer(controller.signal))return;const outcome=await request(controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;settle(outcome);}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  }
  const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;
  const providerChannels=ready?.providerCatalog?.[0]?.channels??[];
  /** The single highlighted action, from the current own metadata at its observation time. */
  const nextAction=configuration?.audience===TRIBE_MEMBER_ROLE.leader?resolveMessagingConnectionsNextAction({...configuration,observedAt}):null;
  const resourceController=useMessagingResourceController({candidate,slug:ready?.slug??"",client:resourcesClient,availableChannels:providerChannels,blocked:recoveryBusy||!ready||phase!==PHASE.idle||Boolean(pending)||needsCurrent,observe:observeResource,configure:(draft)=>configureChannel(draft),feedback:(next)=>{if(!pending&&!needsCurrent)toastMessagingRead(next);},conflict:()=>setNeedsCurrent(true)});
  const diagnosticController=useMessagingDiagnosticController({candidate,renderedAt:ready?.renderedAt??new Date(0).toISOString(),usage:configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.usage:{state:"not_configured",policy:null},blocked:recoveryBusy||!ready||phase!==PHASE.idle||Boolean(pending)||needsCurrent,issue:(destination,currentChallengeId)=>issueDiagnostic(destination,currentChallengeId),verify:(diagnostic,code)=>verifyDiagnostic(diagnostic,code),readDelivery:(diagnostic)=>readDiagnosticDelivery(diagnostic),preferredChannel:nextAction?.channel??null,feedback:()=>{}});
  const activationController=useMessagingActivationController({candidate,usage:configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.usage:{state:"not_configured",policy:null},renderedAt:ready?.renderedAt??new Date(0).toISOString(),blocked:recoveryBusy||!ready||phase!==PHASE.idle||Boolean(pending)||needsCurrent,activate:()=>activateCandidate(),feedback:()=>{}});
  const lifecycleController=useMessagingLifecycleController({configuration,initialTarget:initialLifecycleTarget,blocked:recoveryBusy||!ready||phase!==PHASE.idle||Boolean(pending)||needsCurrent,act:(connection,retiring,reason)=>performLifecycle(connection,retiring,reason)});
  /** @param connection - Exact own current view resource. @param retiring - Explicit ordinary retirement choice. @param reason - Explicit safe suspension cause. @param retirement - Announcement and follow-up of a confirmed retirement, used when the Clave step replaces a candidate key. @returns Original local metadata reconciled with current owner, without SDK or route refresh. */
  async function performLifecycle(connection:MessagingLifecycleConnectionView,retiring:boolean,reason:MessagingConnectionSuspensionInput["reason"],retirement?:{text:string;onRetired:()=>void}):Promise<void>{
    if(!ready||busy.current||pending||needsCurrent||phase!==PHASE.idle||configuration?.audience!==TRIBE_MEMBER_ROLE.leader)return;
    await toastMessagingWrite(retiring?LIFECYCLE_COPY.retiring:LIFECYCLE_COPY.stopping,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(retirement?WRITE_ACTION.replaceCandidateKey:WRITE_ACTION.changeLifecycle);setReplacementScope("");setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();diagnosticController.clearPrivate();
    try{
      if(!await checkViewer(controller.signal))return;const operationId=newAdmissionOperationId(),original={connectionId:connection.id,expectedVersion:connection.version},intent:MessagingConnectionsPendingIntent=retiring?{type:REAUTHENTICATION_OPERATION.disconnectMessagingConnection,operationId,original}:{type:REAUTHENTICATION_OPERATION.suspendMessagingConnection,operationId,original:{...original,reason}};if(!retain(intent))return;
      const scope={slug:ready.slug,connectionId:connection.id},input={operationId,expectedVersion:connection.version,confirmed:true as const},outcome=retiring?await lifecycleClient.disconnect(scope,input,controller.signal):await lifecycleClient.suspend(scope,{...input,reason},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready"){applyConfiguration(current.value);const committed=outcome.value.result,matching=current.value.audience===TRIBE_MEMBER_ROLE.leader?[current.value.selected,current.value.candidate].find((resource)=>resource?.id===committed.id):null,applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&(retiring?!matching:matching?.version===committed.version&&matching.state===committed.state);if(applies&&retiring)retirement?.onRetired();if(retain(null))emit({kind:"status",text:!applies?LIFECYCLE_COPY.historical:retiring?retirement?.text??LIFECYCLE_COPY.retired:reason===MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise?LIFECYCLE_COPY.compromised:LIFECYCLE_COPY.stopped});}else holdPending(LIFECYCLE_COPY.pending);return;}
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))emit({kind:"alert",text:outcome.message});}else holdPending(LIFECYCLE_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  }
  /** Consent to retire the candidate from the Clave step, keyed to its exact id and version so any change asks again. */
  const[replacementScope,setReplacementScope]=useState("");
  /** The candidate whose key the Clave step can replace: a separate candidate, never the selection the academy uses now. */
  const replaceable=candidate&&configuration?.audience===TRIBE_MEMBER_ROLE.leader&&candidate.id!==configuration.selected?.id&&candidate.state!==MESSAGING_CONNECTION_STATE.disconnected?candidate:null,replacementKey=replaceable?`${replaceable.id}:${replaceable.version}`:"";
  /** @returns Nothing after one explicit retirement of the candidate only, then back to an empty Clave form that keeps its name; the selection is never touched. */
  const replaceCandidateKey=async()=>{
    if(!replaceable||replacementScope!==replacementKey)return;const retired=replaceable;
    await performLifecycle({id:retired.id,name:retired.name,version:retired.version,state:retired.state,selected:false,candidate:true},true,MESSAGING_CONNECTION_SECURITY_REASON.securityStop,{text:REPLACEMENT_COPY.retired(retired.name),onRetired:()=>{setName(retired.name);setCurrentStepId(messagingConnectionsStepId(STEP_KIND.key));}});
  };
  /** @param signal - Current operation observation. @returns Whether the same SSR viewer remains current; role/resource authority is independently server-checked. */
  const checkViewer=async(signal:AbortSignal)=>{if(!ready)return false;const current=await client.viewer(signal);if(signal.aborted||!mounted.current)return false;if(current.status!=="ready"||current.value?.id!==ready.viewerId){setApiKey("");setConfirmed(false);setPhase(PHASE.unavailable);setNotice(COPY.viewerChanged);return false;}return true;};
  /** @param intent - Metadata reference, never the input key. @returns Whether it was safely saved/cleared for this exact viewer/route. */
  const retain=(intent:MessagingConnectionsPendingIntent|null)=>{if(!ready||!store.write(ready.viewerId,ready.slug,intent)){if(intent===null)setNotice(COPY.clearFailed);else emit({kind:"alert",text:COPY.storageUnavailable});return false;}setPending(intent);setNotice(null);if(intent===null){setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);}return true;};
  /** @param operationId - Confirmed original issuance UUID. @param result - Guarded masked issued tuple. @returns Whether its safe reference survives a page reload; no recipient/code is persisted. */
  const rememberDiagnostic=(operationId:string,result:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>)=>{
    const reference={operationId,connectionId:result.connectionId,configurationVersion:result.connectionVersion,channel:result.channel};
    if(!ready||!store.writeDiagnostic(ready.viewerId,ready.slug,reference)){emit({kind:"alert",text:COPY.storageUnavailable});return false;}setDiagnosticReferences((previous)=>[...previous.filter((entry)=>entry.operationId!==operationId),reference]);return true;
  };
  /** @param reference - Preserved issued UUID and exact public scope. @returns Nothing after explicit original/current lookup; no new challenge or code is created. */
  const readIssuedDiagnostic=async(reference:MessagingDiagnosticObservationReference)=>{
    if(!ready||busy.current||pending||phase!==PHASE.idle)return;
    toastMessagingRead(await collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);activationController.reset();lifecycleController.reset();diagnosticController.clearPrivate();
    try{
      if(!await checkViewer(controller.signal))return;const original=await client.operation(ready.slug,reference.operationId,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(original.status!=="ready"||original.value.type!==REAUTHENTICATION_OPERATION.diagnoseMessagingConnection||original.value.state!==OPERATION_STATE.completed||original.value.result.outcome!==VERIFICATION_ISSUANCE_OUTCOME.issued||original.value.result.connectionId!==reference.connectionId||original.value.result.connectionVersion!==reference.configurationVersion||original.value.result.channel!==reference.channel){emit({kind:"alert",text:DIAGNOSTIC_COPY.pending});return;}
      const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status!=="ready"){emit({kind:"alert",text:DIAGNOSTIC_COPY.pending});return;}applyConfiguration(current.value);
      const applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.candidate?.id===reference.connectionId&&current.value.candidate.configurationVersion===reference.configurationVersion;
      if(applies){if(!rememberDiagnostic(reference.operationId,original.value.result))return;diagnosticController.acceptIssuance(original.value.result);}emit({kind:"status",text:applies?DIAGNOSTIC_COPY.issued:DIAGNOSTIC_COPY.originalHistorical});
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  /** @param result - Original initial candidate metadata. @returns Nothing after applying only its incremental view facts and clearing private input. */
  const applyCreated=(result:MessagingConnectionMutationResult)=>{setApiKey("");setConfirmed(false);setConfiguration((current)=>current?.audience==="leader"?{...current,candidate:{...result,credentialState:MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated,credentialMode:MESSAGING_CREDENTIAL_MODE.unknown,capabilities:[]}}:current);if(retain(null))emit({kind:"status",text:COPY.saved});setPhase(PHASE.idle);};
  /** @returns Nothing after readonly reconciliation of the original reference, never a retry of the key. */
  const recover=async()=>{if(!ready||!pending||busy.current)return;toastMessagingRead(await collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);try{if(!await checkViewer(controller.signal))return;const result=await client.operation(ready.slug,pending.operationId,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.type===pending.type&&result.value.state===OPERATION_STATE.completed){const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready"){if(result.value.type===REAUTHENTICATION_OPERATION.diagnoseMessagingConnection&&result.value.result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued&&!rememberDiagnostic(result.value.operationId,result.value.result))return;applyConfiguration(current.value);setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();if(retain(null)){if(result.value.type===REAUTHENTICATION_OPERATION.validateMessagingConnection)emit(result.value.result.failureCode?{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.value.result.failureCode]}:{kind:"status",text:CHECK_COPY.recovered});else if(result.value.type===REAUTHENTICATION_OPERATION.diagnoseMessagingConnection){if(result.value.result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued){const applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.candidate?.id===result.value.result.connectionId&&current.value.candidate.configurationVersion===result.value.result.connectionVersion;if(applies)diagnosticController.acceptIssuance(result.value.result);emit({kind:"status",text:applies?DIAGNOSTIC_COPY.issued:DIAGNOSTIC_COPY.originalHistorical});}else emit({kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.value.result.code]});}else if(result.value.type===REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic){if(result.value.result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified){const applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&pending.type===REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic&&current.value.candidate?.id===pending.original.connectionId&&current.value.candidate.configurationVersion===result.value.result.connectionVersion;if(applies)diagnosticController.acceptVerification(result.value.result);emit({kind:"status",text:applies?DIAGNOSTIC_COPY.verified:DIAGNOSTIC_COPY.originalHistorical});}else emit({kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.value.result.code]});}else if(result.value.type===REAUTHENTICATION_OPERATION.activateMessagingConnection)emit({kind:"status",text:current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.selected?.id===result.value.result.id&&current.value.selected.configurationVersion===result.value.result.configurationVersion?ACTIVATION_COPY.recovered:ACTIVATION_COPY.historical});else if(result.value.type===REAUTHENTICATION_OPERATION.suspendMessagingConnection||result.value.type===REAUTHENTICATION_OPERATION.disconnectMessagingConnection)emit({kind:"status",text:LIFECYCLE_COPY.historical});else if(result.value.type===REAUTHENTICATION_OPERATION.configureMessagingConnection)emit({kind:"status",text:RESOURCE_COPY.recovered});else emit({kind:"status",text:COPY.saved});}setPhase(PHASE.idle);}else holdPending(COPY.pending);return;}if(result.status==="ready"&&result.value.type===pending.type&&result.value.state===OPERATION_STATE.started||result.status==="failed"&&result.code===MESSAGING_ERROR_CODE.resourceUnavailable){
      const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status==="ready"){applyConfiguration(current.value);setResumeConfirmed(false);const nonDiagnostic=pending.type!==REAUTHENTICATION_OPERATION.diagnoseMessagingConnection&&pending.type!==REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic;setCanResume(nonDiagnostic&&Boolean(pending.original));setCanArchive(nonDiagnostic&&current.value.audience===TRIBE_MEMBER_ROLE.leader);setArchiveConfirmed(false);setNotice(pending.original?RECOVERY_COPY.originalUnconfirmed:RECOVERY_COPY.originalMissing);}else{setCanResume(false);holdPending(COPY.pending);}return;
    }setCanResume(false);holdPending(COPY.pending);}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));};
  /** Effect-only callbacks observe the latest viewer/controller without restarting restoration for a render-only identity change. */
  const restoreViewer=useEffectEvent((signal:AbortSignal)=>checkViewer(signal));
  const restoreDiagnostic=useEffectEvent((result:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>)=>diagnosticController.acceptIssuance(result));
  useEffect(()=>{mounted.current=true;const controller=new AbortController();async function restore(){if(!ready)return;const viewer=await client.viewer(controller.signal);if(controller.signal.aborted||!mounted.current)return;if(viewer.status!=="ready"||viewer.value?.id!==ready.viewerId){setApiKey("");setPhase(PHASE.unavailable);setNotice(COPY.viewerChanged);return;}setHistory(store.history(ready.viewerId,ready.slug));setDiagnosticReferences(store.diagnostics(ready.viewerId,ready.slug));const intent=store.read(ready.viewerId,ready.slug);if(intent)setPending(intent);
    else if(ready.configuration.audience===TRIBE_MEMBER_ROLE.leader){
      const reference=store.diagnostic(ready.viewerId,ready.slug);
      if(reference){
        const original=await client.operation(ready.slug,reference.operationId,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await restoreViewer(controller.signal))return;
        if(original.status==="ready"&&original.value.type===REAUTHENTICATION_OPERATION.diagnoseMessagingConnection&&original.value.state===OPERATION_STATE.completed&&original.value.result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued&&original.value.result.connectionId===reference.connectionId&&original.value.result.connectionVersion===reference.configurationVersion&&original.value.result.channel===reference.channel){
          const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await restoreViewer(controller.signal))return;
          if(current.status==="ready"){applyConfiguration(current.value);const applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.candidate?.id===reference.connectionId&&current.value.candidate.configurationVersion===reference.configurationVersion;if(applies){restoreDiagnostic(original.value.result);if(!isMessagingDiagnosticSettled(original.value.result,current.value.audience===TRIBE_MEMBER_ROLE.leader?current.value.candidate:null)){setCurrentStepId(messagingConnectionsStepId(STEP_KIND.test,original.value.result.channel));setSecurityOpen(false);}}else toastMessagingRead({kind:"status",text:DIAGNOSTIC_COPY.originalHistorical});}else toastMessagingRead({kind:"alert",text:DIAGNOSTIC_COPY.pending});
        }else toastMessagingRead({kind:"alert",text:DIAGNOSTIC_COPY.pending});
      }else if(Date.now()-Date.parse(ready.renderedAt)>MESSAGING_CONNECTIONS_RESTORED_SNAPSHOT_MAX_AGE_MS){
        // A snapshot restored by Atrás may predate a change saved on another page (Países y cupos), so read the current state once.
        const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await restoreViewer(controller.signal))return;
        if(current.status==="ready")applyConfiguration(current.value);
      }
    }setPhase(PHASE.idle);}void restore().catch(()=>{if(controller.signal.aborted||!mounted.current)return;setApiKey("");setPhase(PHASE.unavailable);setNotice(COPY.storageUnavailable);});return()=>{mounted.current=false;controller.abort();observation.current?.abort();};},[ready,client,store]);
  /** @returns Nothing after field validation and a single explicit original write; lost responses preserve reference but erase the key. */
  const save=async()=>{
    if(!ready||busy.current||phase!==PHASE.idle||pending||needsCurrent||configuration?.audience!=="leader")return;
    const errors:typeof fieldErrors={};if(!name.trim())errors.name=COPY.nameRequired;else if(name.trim().length>ADMISSION_LIMIT.displayNameCharacters)errors.name=COPY.nameTooLong;if(!apiKey.trim())errors.apiKey=COPY.keyRequired;if(!confirmed)errors.confirmation=COPY.confirmationRequired;setFieldErrors(errors);if(Object.keys(errors).length)return;
    await toastMessagingWrite(COPY.writing,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.saveConnection);
    try{if(!await checkViewer(controller.signal))return;const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.saveMessagingCredentials,operationId:newAdmissionOperationId(),original:{name:name.trim()}};if(!retain(intent))return;const result=await client.create(ready.slug,{operationId:intent.operationId,confirmed:true,providerId:MESSAGING_INITIAL_PROVIDER_ID,name:name.trim(),apiKey:apiKey.trim()},controller.signal);if(controller.signal.aborted||!mounted.current)return;setApiKey("");if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.state===OPERATION_STATE.completed){applyCreated(result.value.result);return;}if(result.status==="failed"&&!result.uncertain){if(result.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))emit({kind:"alert",text:result.message});}else holdPending(COPY.pending);}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  /** @returns Nothing after one explicit candidate CAS check and current lifecycle reconciliation; it cannot activate a channel. */
  const validate=async()=>{
    const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;
    if(!ready||!candidate||!validationConfirmed||busy.current||phase!==PHASE.idle||pending||needsCurrent)return;
    await toastMessagingWrite(CHECK_COPY.checking,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");startWriting(WRITE_ACTION.validateCredential);
    try{
      if(!await checkViewer(controller.signal))return;
      const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.validateMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version}};if(!retain(intent))return;
      setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();
      const outcome=await client.validate(ready.slug,candidate.id,{operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){
        const result=outcome.value.result;
        if(result.configurationVersion!==candidate.configurationVersion){holdPending(CHECK_COPY.pending);return;}
        // Credential changes can retire candidate readiness; the minimal result cannot reconstruct the current lifecycle.
        const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
        if(current.status!=="ready"){holdPending(CHECK_COPY.pending);return;}applyConfiguration(current.value);
        if(retain(null))emit(result.failureCode?{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.failureCode]}:{kind:"status",text:CHECK_COPY.checked});
        return;
      }
      if(outcome.status==="failed"&&!outcome.uncertain){
        if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);
        // A completed check that failed (rejected key, test account) still advanced the candidate: show its current state instead of the stale one.
        else{const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready")applyConfiguration(current.value);else setNeedsCurrent(true);}
        if(retain(null))emit({kind:"alert",text:outcome.message});
      }else holdPending(CHECK_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  /** @param draft - Explicit chosen references already confirmed by the controlled form. @returns Nothing after original versioned configuration and authoritative metadata reconciliation, without sending a message. */
  async function configureChannel(draft:MessagingChannelDraft):Promise<void>{
    const validation=validateMessagingChannelDraft(draft);
    if(!ready||!candidate||!validation.valid||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    await toastMessagingWrite(RESOURCE_COPY.writing,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.configureChannel);setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();
    try{
      if(!await checkViewer(controller.signal))return;
      const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.configureMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version,...validation.references}};if(!retain(intent))return;
      const outcome=await resourcesClient.configure({slug:ready.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion},{...validation.references,operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){
        // The minimal write cannot reconstruct all capability timestamps. Read the same owner instead of guessing them or refreshing the route.
        const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
        if(current.status==="ready"){applyConfiguration(current.value);if(retain(null))emit({kind:"status",text:outcome.value.result.changed?RESOURCE_COPY.saved:RESOURCE_COPY.unchanged});}else holdPending(RESOURCE_COPY.pending);return;
      }
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))emit({kind:"alert",text:outcome.message});}else holdPending(RESOURCE_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  }
  /** @returns Nothing after one explicit original candidate selection and an authoritative current read; no SDK or route refresh is used. */
  async function activateCandidate():Promise<void>{
    if(!ready||!candidate||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    await toastMessagingWrite(ACTIVATION_COPY.activating,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.activateCandidate);setApiKey("");resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();diagnosticController.clearPrivate();
    try{
      if(!await checkViewer(controller.signal))return;const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.activateMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version}};if(!retain(intent))return;
      const outcome=await activationClient.activate({slug:ready.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion},{operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){
        // Selection can update dependent policy references; reconcile this owner's snapshot instead of inventing cross-view facts.
        const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
        if(current.status==="ready"){applyConfiguration(current.value);if(retain(null))emit({kind:"status",text:current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.selected?.id===outcome.value.result.id&&current.value.selected.configurationVersion===outcome.value.result.configurationVersion?ACTIVATION_COPY.activated:ACTIVATION_COPY.historical});}else holdPending(ACTIVATION_COPY.pending);return;
      }
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))emit({kind:"alert",text:outcome.message});}else holdPending(ACTIVATION_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  }
  /** @param destination - Explicit normalized destination/consent from the diagnostic form. @param currentChallengeId - Only an explicit resend of an issued challenge. @returns Original issuance or protected uncertainty; no automatic retry. */
  async function issueDiagnostic(destination:MessagingDiagnosticDestination,currentChallengeId?:string):Promise<void>{
    if(diagnosticReferences.length>=MESSAGING_CONNECTION_HISTORY_LIMIT){toastMessagingRead({kind:"alert",text:DIAGNOSTIC_COPY.historyFull});return;}
    if(!ready||!candidate||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    activationController.reset();lifecycleController.reset();await toastMessagingWrite(DIAGNOSTIC_COPY.issuing,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(currentChallengeId?WRITE_ACTION.resendDiagnostic:WRITE_ACTION.issueDiagnostic);
    try{
      if(!await checkViewer(controller.signal))return;const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version,channel:destination.channel}};if(!retain(intent))return;
      const outcome=await diagnosticClient.issue({slug:ready.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion},{...destination,operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true,...(currentChallengeId?{currentChallengeId}:{})},controller.signal);diagnosticController.clearPrivate();
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){const result=outcome.value.result;if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued){if(!rememberDiagnostic(intent.operationId,result))return;diagnosticController.acceptIssuance(result);}if(retain(null))emit(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued?{kind:"status",text:DIAGNOSTIC_COPY.issued}:{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.code]});return;}
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))emit({kind:"alert",text:outcome.message});}else holdPending(DIAGNOSTIC_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  }
  /** @param diagnostic - Safe original issued tuple. @param code - Received ephemeral code, never saved to history. @returns Local capability confirmation and current metadata, without another send. */
  async function verifyDiagnostic(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>,code:string):Promise<void>{
    if(!ready||!candidate||busy.current||pending||needsCurrent||phase!==PHASE.idle||candidate.id!==diagnostic.connectionId||candidate.configurationVersion!==diagnostic.connectionVersion)return;
    activationController.reset();lifecycleController.reset();await toastMessagingWrite(DIAGNOSTIC_COPY.verifying,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.verifyDiagnostic);
    try{
      if(!await checkViewer(controller.signal))return;const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic,operationId:newAdmissionOperationId(),original:{connectionId:diagnostic.connectionId,configurationVersion:diagnostic.connectionVersion,diagnosticId:diagnostic.diagnosticId,channel:diagnostic.channel}};if(!retain(intent))return;
      const outcome=await diagnosticClient.verify({slug:ready.slug,connectionId:diagnostic.connectionId,configurationVersion:diagnostic.connectionVersion,diagnosticId:diagnostic.diagnosticId,channel:diagnostic.channel},{operationId:intent.operationId,confirmed:true,verificationCode:code},controller.signal);diagnosticController.clearPrivate();
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready"){applyConfiguration(current.value);const applies=current.value.audience===TRIBE_MEMBER_ROLE.leader&&current.value.candidate?.id===diagnostic.connectionId&&current.value.candidate.configurationVersion===diagnostic.connectionVersion;if(applies)diagnosticController.acceptVerification(outcome.value.result);if(retain(null))emit(outcome.value.result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified?{kind:"status",text:applies?DIAGNOSTIC_COPY.verified:DIAGNOSTIC_COPY.originalHistorical}:{kind:"alert",text:MESSAGING_ERROR_MESSAGE[outcome.value.result.code]});}else holdPending(DIAGNOSTIC_COPY.pending);return;}
      if(outcome.status==="failed"&&!outcome.uncertain){if(retain(null))emit({kind:"alert",text:outcome.message});}else holdPending(DIAGNOSTIC_COPY.pending);
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  }
  /** @param diagnostic - Original associated delivery. @returns Transport facts only, never local code possession or another send. */
  async function readDiagnosticDelivery(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>):Promise<void>{
    if(!ready||!candidate||pending||candidate.id!==diagnostic.connectionId||candidate.configurationVersion!==diagnostic.connectionVersion)return;
    toastMessagingRead(await collectFeedback(()=>observeResource((signal)=>diagnosticClient.delivery({slug:ready.slug,deliveryId:diagnostic.deliveryId,channel:diagnostic.channel},signal),(outcome)=>{if(outcome.status==="ready")diagnosticController.acceptDelivery(outcome.value);else if(outcome.status==="failed")emit({kind:"alert",text:outcome.message});})));
  }
  /** @returns Nothing after an explicit original replay using preserved public input and renewed consent; keys remain ephemeral and no new UUID is created. */
  const resumeOriginal=async()=>{
    if(!ready||!pending?.original||!canResume||!resumeConfirmed||busy.current||phase!==PHASE.idle||pending.type===REAUTHENTICATION_OPERATION.diagnoseMessagingConnection||pending.type===REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic)return;
    if(pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials&&!apiKey.trim())return;
    await toastMessagingWrite(RECOVERY_COPY.resuming,()=>collectFeedback(async()=>{if(!pending?.original)return;busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.resumeOriginal);setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);
    try{
      if(!await checkViewer(controller.signal))return;
      let outcome;
      if(pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials)outcome=await client.create(ready.slug,{operationId:pending.operationId,confirmed:true,providerId:MESSAGING_INITIAL_PROVIDER_ID,name:pending.original.name,apiKey:apiKey.trim()},controller.signal);
      else if(pending.type===REAUTHENTICATION_OPERATION.validateMessagingConnection)outcome=await client.validate(ready.slug,pending.original.connectionId,{operationId:pending.operationId,confirmed:true,expectedVersion:pending.original.expectedVersion},controller.signal);
      else if(pending.type===REAUTHENTICATION_OPERATION.activateMessagingConnection)outcome=await activationClient.activate({slug:ready.slug,connectionId:pending.original.connectionId,configurationVersion:pending.original.configurationVersion},{operationId:pending.operationId,expectedVersion:pending.original.expectedVersion,confirmed:true},controller.signal);
      else if(pending.type===REAUTHENTICATION_OPERATION.suspendMessagingConnection)outcome=await lifecycleClient.suspend({slug:ready.slug,connectionId:pending.original.connectionId},{operationId:pending.operationId,expectedVersion:pending.original.expectedVersion,confirmed:true,reason:pending.original.reason},controller.signal);
      else if(pending.type===REAUTHENTICATION_OPERATION.disconnectMessagingConnection)outcome=await lifecycleClient.disconnect({slug:ready.slug,connectionId:pending.original.connectionId},{operationId:pending.operationId,expectedVersion:pending.original.expectedVersion,confirmed:true},controller.signal);
      else{const{connectionId,configurationVersion,...original}=pending.original;outcome=await resourcesClient.configure({slug:ready.slug,connectionId,configurationVersion},{...original,operationId:pending.operationId,confirmed:true},controller.signal);}
      setApiKey("");if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      // Observe the original separately; a successful replay is never substituted for the current view.
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed||outcome.status==="failed"&&outcome.uncertain){setNotice(RECOVERY_COPY.consultAgain);emit({kind:"status",text:RECOVERY_COPY.resumed});}
      else emit({kind:"alert",text:outcome.status==="failed"?outcome.message:COPY.pending});
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  /** @returns Nothing after explicit local archiving and a fresh authorized current read; no backend work is cancelled or rewritten. */
  const archiveOriginal=async()=>{
    if(!ready||!pending||!canArchive||!archiveConfirmed||busy.current||phase!==PHASE.idle)return;
    await toastMessagingWrite(RECOVERY_COPY.archiving,()=>collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;startWriting(WRITE_ACTION.archiveOriginal);setApiKey("");setResumeConfirmed(false);setArchiveConfirmed(false);
    try{
      if(!await checkViewer(controller.signal))return;const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status!=="ready"||current.value.audience!==TRIBE_MEMBER_ROLE.leader){emit({kind:"alert",text:CHECK_COPY.currentUnavailable});return;}
      if(!store.archive(ready.viewerId,ready.slug,pending)){emit({kind:"alert",text:RECOVERY_COPY.archiveFailed});return;}
      setHistory((previous)=>previous.some((entry)=>entry.type===pending.type&&entry.operationId===pending.operationId)?previous:[...previous,pending]);applyConfiguration(current.value);
      if(retain(null)){setNeedsCurrent(false);emit({kind:"status",text:RECOVERY_COPY.archived});}
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  /** @param original - Preserved own history entry. @returns Nothing after restoring the same UUID for readonly observation, never a new write. */
  const restoreHistory=(original:MessagingConnectionsPendingIntent)=>{if(!ready||busy.current||pending||phase!==PHASE.idle)return;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();retain(original);};
  /** @returns Nothing after an explicit current metadata read; a stale CAS cannot be silently retried. */
  const readCurrent=async()=>{
    if(!ready||busy.current||phase!==PHASE.idle)return;
    toastMessagingRead(await collectFeedback(async()=>{busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();activationController.reset();lifecycleController.reset();setPhase(PHASE.recovering);setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);
    try{
      if(!await checkViewer(controller.signal))return;const current=await client.read(ready.slug,controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status==="ready"){applyConfiguration(current.value);setNeedsCurrent(false);emit({kind:"status",text:CHECK_COPY.currentRead});}else{setNeedsCurrent(true);emit({kind:"alert",text:CHECK_COPY.currentUnavailable});}
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}}));
  };
  if(!ready||phase===PHASE.unavailable)return<AdmissionRouteError embedded reset={()=>{window.location.reload();}} message={initialState.kind==="unavailable"?initialState.message:notice??COPY.viewerChanged} />;
  if(!configuration)return null;
  const pendingAction=phase===PHASE.writing?writingAction:null;
  const isBusy=recoveryBusy||phase!==PHASE.idle,canSave=!pending&&!needsCurrent&&!isBusy&&Boolean(name.trim()&&apiKey.trim()&&confirmed),blockedActions=isBusy||Boolean(pending)||needsCurrent;
  const connectionPanel=<MessagingConnections configuration={configuration} name={name} apiKey={apiKey} confirmed={confirmed} busy={isBusy} saving={pendingAction===WRITE_ACTION.saveConnection} validating={pendingAction===WRITE_ACTION.validateCredential} canSave={canSave} validationConfirmed={validationConfirmed} canValidate={!pending&&!needsCurrent&&!isBusy&&validationConfirmed} fieldErrors={fieldErrors} onNameChange={(value)=>{setResumeConfirmed(false);setName(value);setFieldErrors((current)=>({...current,name:undefined}));}} onApiKeyChange={(value)=>{setResumeConfirmed(false);setApiKey(value);setFieldErrors((current)=>({...current,apiKey:undefined}));}} onConfirmationChange={(value)=>{setConfirmed(value);setFieldErrors((current)=>({...current,confirmation:undefined}));}} onValidationConfirmationChange={(value)=>{setValidationConfirmed(value);}} onValidate={()=>{void validate();}} onSave={()=>{void save();}} onReplaceKey={replaceable&&replaceable.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid?()=>{if(!isBusy)setCurrentStepId(messagingConnectionsStepId(STEP_KIND.key));}:undefined} />;
  if(configuration.audience!==TRIBE_MEMBER_ROLE.leader)return connectionPanel;
  const diagnosticHistory=<MessagingDiagnosticHistory references={diagnosticReferences} busy={isBusy||Boolean(pending)} onRead={(reference)=>{void readIssuedDiagnostic(reference);}} />;
  // Pending originals stay above the tabs: they block every step and must not hide behind one. A pressed continuation stays mounted while it runs.
  const resuming=pendingAction===WRITE_ACTION.resumeOriginal,archiving=pendingAction===WRITE_ACTION.archiveOriginal;
  // A pending original stays above the flow, also while its own write runs (its recovery is disabled then); the persistent explanation appears once that write settles.
  const writingOriginal=phase===PHASE.writing&&!resuming&&!archiving;
  const attentionNotice=pending?(writingOriginal?null:notice??COPY.pending):needsCurrent?CHECK_COPY.stale:null;
  const attention=pending||attentionNotice?<MessagingConnectionsAttention notice={attentionNotice}>{pending&&<div><Button variant="secondary" disabled={isBusy} onClick={()=>{void recover();}}>Consultar guardado</Button></div>}{pending&&(canArchive||resuming||archiving)&&<MessagingOriginalRecovery requiresKey={pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials&&(canResume||resuming)} resumable={canResume||resuming} confirmed={resumeConfirmed} archiveConfirmed={archiveConfirmed} busy={isBusy} resuming={resuming} archiving={archiving} canResume={resumeConfirmed&&(pending.type!==REAUTHENTICATION_OPERATION.saveMessagingCredentials||Boolean(apiKey.trim()))} onConfirm={setResumeConfirmed} onArchiveConfirm={setArchiveConfirmed} onArchive={()=>{void archiveOriginal();}} onResume={()=>{void resumeOriginal();}} />}</MessagingConnectionsAttention>:null;
  const usageHref=`/${encodeURIComponent(ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`;
  // A test whose channel was already confirmed after it was issued no longer waits for its code.
  const diagnosticSettled=Boolean(diagnosticController.diagnostic&&isMessagingDiagnosticSettled(diagnosticController.diagnostic,candidate));
  const action=nextAction??resolveMessagingConnectionsNextAction({selected:configuration.selected,candidate,usage:configuration.usage,observedAt});
  const flow=resolveMessagingConnectionsFlow({selected:configuration.selected,candidate,usage:configuration.usage,observedAt});
  // A step that left the flow (a channel reconfigured away) falls back to the step the next action points to.
  const actionStepId=messagingConnectionsActionStepId(action),foundIndex=flow.findIndex((step)=>step.id===currentStepId),currentIndex=foundIndex>=0?foundIndex:Math.max(0,flow.findIndex((step)=>step.id===actionStepId));
  const currentStep=flow[currentIndex];
  const actionInView=!securityOpen&&(action.target?.kind==="security"?false:actionStepId===currentStep.id);
  /** @param index - Step chosen with Atrás or Siguiente. @returns Nothing after moving, with a test step's channel preselected; moving never sends, saves or activates. */
  const moveTo=(index:number)=>{const step=flow[index];if(!step||isBusy)return;setCurrentStepId(step.id);if(step.channel)diagnosticController.preselect(step.channel);};
  /** @returns Nothing after opening exactly where the next action is resolved, with its channel preselected. */
  const openNextAction=()=>{if(action.target?.kind==="security"){if(candidate)lifecycleController.preselect(candidate.id,true);setSecurityOpen(true);return;}const index=flow.findIndex((step)=>step.id===actionStepId);setSecurityOpen(false);if(index>=0)moveTo(index);};
  /** @param channel - Channel of the open test step. @returns Whether the issued test belongs to it; SMS and WhatsApp share the phone challenge, so either step can replace it. */
  const diagnosticFor=(channel:typeof MESSAGING_PUBLIC_CHANNEL[keyof typeof MESSAGING_PUBLIC_CHANNEL])=>{const diagnostic=diagnosticController.diagnostic;return diagnostic&&(diagnostic.channel===channel||diagnostic.channel!==MESSAGING_PUBLIC_CHANNEL.email&&channel!==MESSAGING_PUBLIC_CHANNEL.email)?diagnostic:null;};
  const blockedNote=(text:string)=><MessagingConnectionsStepNote>{text}</MessagingConnectionsStepNote>;
  /** @param kind - Kind of the open step. @param channel - Channel of a test step. @returns The wired panel for that single decision. */
  const stepContent=(kind:typeof currentStep.kind,channel:typeof currentStep.channel)=>{
    if(kind===STEP_KIND.key)return replaceable?<MessagingCandidateKeyReplacement candidateName={replaceable.name} credentialLabel={MESSAGING_CREDENTIAL_LABEL[replaceable.credentialState]} selectedName={configuration.selected?.name??null} confirmed={replacementScope===replacementKey} busy={blockedActions} replacing={pendingAction===WRITE_ACTION.replaceCandidateKey} canReplace={!blockedActions} onConfirm={(value)=>setReplacementScope(value?replacementKey:"")} onReplace={()=>{void replaceCandidateKey();}} />:candidate?blockedNote(FLOW_COPY.savedKey):connectionPanel;
    if(kind===STEP_KIND.credential)return candidate?connectionPanel:blockedNote(FLOW_COPY.keyRequired);
    if(!candidate)return blockedNote(kind===STEP_KIND.activation&&action.step===MESSAGING_CONNECTIONS_NEXT_STEP.active?FLOW_COPY.selectedActive:FLOW_COPY.keyRequired);
    if(kind===STEP_KIND.channels)return<MessagingConnectionResources availableChannels={providerChannels} {...resourceController.draft} confirmed={resourceController.confirmed} busy={blockedActions} saving={pendingAction===WRITE_ACTION.configureChannel} canSave={resourceController.canSave} senders={resourceController.senders} templates={resourceController.templates} fieldErrors={resourceController.fieldErrors} message={null} onChannelChange={(next)=>resourceController.change({channel:next,senderId:"",templateId:"",templateLanguage:""})} onSenderChange={(senderId)=>resourceController.change({...resourceController.draft,senderId})} onTemplateChange={resourceController.chooseTemplate} onTemplateLanguageChange={(templateLanguage)=>resourceController.change({...resourceController.draft,templateLanguage})} onConfirmationChange={resourceController.confirm} onReadSenders={()=>{void resourceController.readSenders();}} onMoreSenders={()=>{void resourceController.moreSenders();}} onReadTemplates={()=>{void resourceController.readTemplates();}} onMoreTemplates={()=>{void resourceController.moreTemplates();}} onSave={()=>{void resourceController.save();}} />;
    // A test consumes the daily code quota: without Países y cupos the step explains it and links there instead of offering a send that the server rejects.
    if(kind===STEP_KIND.test&&configuration.usage.state===MESSAGING_USAGE_POLICY_STATE.notConfigured)return<MessagingConnectionsUsageRequired usageHref={usageHref} />;
    if(kind===STEP_KIND.test&&channel){const diagnostic=diagnosticFor(channel),settled=Boolean(diagnostic&&diagnosticSettled);return<MessagingConnectionDiagnostic channelLocked channel={diagnosticController.draft.channel} recipient={diagnosticController.draft.recipient} country={diagnosticController.draft.country} verificationCode={diagnosticController.verificationCode} confirmed={diagnosticController.confirmed} busy={blockedActions} issuing={pendingAction===WRITE_ACTION.issueDiagnostic} resending={pendingAction===WRITE_ACTION.resendDiagnostic} verifying={pendingAction===WRITE_ACTION.verifyDiagnostic} canIssue={diagnosticController.canIssue&&diagnosticController.draft.channel===channel&&diagnosticReferences.length<MESSAGING_CONNECTION_HISTORY_LIMIT} canVerify={diagnosticController.canVerify&&!settled} canResend={diagnosticController.canResend&&!settled&&diagnosticReferences.length<MESSAGING_CONNECTION_HISTORY_LIMIT} verified={diagnosticController.verified||settled} expiresInSeconds={settled?null:diagnosticController.expiresInSeconds} resendInSeconds={settled?null:diagnosticController.resendInSeconds} allowedCountries={diagnosticController.allowedCountries} usage={configuration.usage} diagnostic={diagnostic} delivery={diagnostic?diagnosticController.delivery:null} fieldErrors={diagnosticController.fieldErrors} usageHref={usageHref} onChannelChange={(next)=>diagnosticController.change({channel:next,recipient:"",country:""})} onRecipientChange={(recipient)=>diagnosticController.change({...diagnosticController.draft,recipient})} onCountryChange={(country)=>diagnosticController.change({...diagnosticController.draft,country})} onCodeChange={diagnosticController.code} onConfirm={diagnosticController.confirm} onIssue={()=>{void diagnosticController.issue();}} onResend={()=>{void diagnosticController.resend();}} onVerify={()=>{void diagnosticController.verify();}} onReadDelivery={()=>{void diagnosticController.readDelivery();}} />;}
    return<MessagingConnectionActivation candidate={candidate} selected={configuration.selected} confirmed={activationController.confirmed} busy={blockedActions} requirements={activationController.requirements} onConfirm={activationController.confirm} />;
  };
  const done=action.step===MESSAGING_CONNECTIONS_NEXT_STEP.active;
  const steps=flow.map((step,index)=>({id:step.id,title:step.title,description:step.description,content:index===currentIndex?stepContent(step.kind,step.channel):null,blockedReason:step.blockedReason??(isBusy&&index===currentIndex?FLOW_COPY.busy:undefined)}));
  const replacing=Boolean(candidate&&configuration.selected&&configuration.selected.id!==candidate.id);
  const finalAction={label:done?FLOW_COPY.active:replacing?FLOW_COPY.replace:FLOW_COPY.activate,loading:pendingAction===WRITE_ACTION.activateCandidate,disabled:done||!activationController.canActivate,onRun:()=>{void activationController.activate();}};
  const security=<><MessagingConnectionLifecycle connections={lifecycleController.connections} targetId={lifecycleController.targetId} retiring={lifecycleController.retiring} reason={lifecycleController.reason} confirmed={lifecycleController.confirmed} busy={blockedActions} acting={pendingAction===WRITE_ACTION.changeLifecycle} canAct={lifecycleController.canAct} onTarget={lifecycleController.targetChanged} onRetiring={lifecycleController.retiringChanged} onReason={lifecycleController.reasonChanged} onConfirm={lifecycleController.confirm} onAct={()=>{void lifecycleController.act();}} />{!pending&&history.length>0&&<MessagingConnectionsPreservedAttempts>{history.map((original)=><Button key={`${original.type}:${original.operationId}`} variant="secondary" size="sm" disabled={isBusy} onClick={()=>restoreHistory(original)}>Consultar intento conservado</Button>)}</MessagingConnectionsPreservedAttempts>}<NotificationRecoveryContainer slug={ready.slug} viewerId={ready.viewerId} renderedAt={ready.renderedAt} initialCatalog={ready.notificationCatalog?.status==="ready"?ready.notificationCatalog.value:undefined} initialCatalogError={ready.notificationCatalog?.status==="failed"?ready.notificationCatalog.message:undefined} target={configuration.selected} blocked={phase!==PHASE.idle||Boolean(pending)||needsCurrent} viewerVerified={phase!==PHASE.checking} verifyViewer={checkViewer} onBusyChange={recoveryBusyChanged} /></>;
  return<MessagingConnectionsWorkspace selected={configuration.selected} candidate={candidate} nextAction={action} nextActionInView={actionInView} usageHref={usageHref} onNextAction={openNextAction} busy={isBusy} attention={attention} onReadCurrent={()=>{void readCurrent();}} steps={steps} current={currentIndex} onCurrentChange={moveTo} finalAction={finalAction} recovery={diagnosticHistory} security={security} securityOpen={securityOpen} onSecurityToggle={()=>setSecurityOpen((open)=>!open)} />;
}
