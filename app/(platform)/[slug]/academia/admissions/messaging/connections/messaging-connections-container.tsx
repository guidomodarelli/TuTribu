"use client";
/** Owns ephemeral key entry, current viewer checks and original-result recovery; the presenter never owns HTTP/auth/storage. @module messaging-connections-container */
import {useCallback,useEffect,useEffectEvent,useRef,useState,type ReactNode,type RefObject} from "react";
import {usePathname,useSearchParams,type ReadonlyURLSearchParams} from "next/navigation";
import {resolveMessagingRouteRecovery} from "@/lib/messaging/messaging-route-recovery";
import {ROUTES} from "@/src/constants/routes";
import {NotificationRecoveryContainer} from "./notification-recovery-container";
import {Button} from "@golfo/ui";
import {toastMessagingRead,type MessagingConnectionsFeedback} from "./messaging-connections-feedback";
import {MessagingConnectionDiagnostic} from "@/components/academy-admissions/messaging-connection-diagnostic";
import {MessagingDiagnosticHistory} from "@/components/academy-admissions/messaging-diagnostic-history";
import {MessagingConnectionActivation} from "@/components/academy-admissions/messaging-connection-activation";
import {useMessagingActivationController} from "./messaging-activation-controller";
import {messagingActivationBrowserClient} from "@/lib/messaging/messaging-activation-api-client";
import type {MessagingActivationBrowserClient} from "@/src/modules/messaging/application/ports/messaging-activation-browser-client";
import type {MessagingLifecycleBrowserClient} from "@/src/modules/messaging/application/ports/messaging-lifecycle-browser-client";
import {messagingLifecycleBrowserClient} from "@/lib/messaging/messaging-lifecycle-api-client";
import {MessagingCandidateKeyReplacement} from "@/components/academy-admissions/messaging-candidate-key-replacement";
import {MESSAGING_CREDENTIAL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {MessagingConnectionLifecycle} from "@/components/academy-admissions/messaging-connection-lifecycle";
import {useMessagingLifecycleController} from "./messaging-lifecycle-controller";
import {useMessagingDiagnosticController} from "./messaging-diagnostic-controller";
import {messagingDiagnosticBrowserClient} from "@/lib/messaging/messaging-diagnostic-api-client";
import type {MessagingDiagnosticBrowserClient} from "@/src/modules/messaging/application/ports/messaging-diagnostic-browser-client";
import {MessagingOriginalRecovery} from "@/components/academy-admissions/messaging-original-recovery";
import {MessagingConnectionResources} from "@/components/academy-admissions/messaging-connection-resources";
import {useMessagingResourceController} from "./messaging-resource-controller";
import {messagingResourcesBrowserClient} from "@/lib/messaging/messaging-resources-api-client";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import {MessagingConnections} from "@/components/academy-admissions/messaging-connections";
import {MessagingConnectionsAttention,MessagingConnectionsPreservedAttempts,MessagingConnectionsStepNote,MessagingConnectionsUsageRequired,MessagingConnectionsWorkspace} from "@/components/academy-admissions/messaging-connections-workspace";
import {MESSAGING_USAGE_POLICY_STATE} from "@/src/modules/messaging/constants/messaging-limits";
import {MESSAGING_USAGE_SETTINGS_SEGMENT} from "@/src/modules/messaging/constants/messaging-usage";
import {isMessagingDiagnosticSettled,resolveMessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import {MESSAGING_CONNECTIONS_FLOW_COPY as FLOW_COPY,MESSAGING_CONNECTIONS_NEXT_STEP,MESSAGING_CONNECTIONS_STEP_KIND as STEP_KIND} from "@/src/modules/messaging/constants/messaging-connections-workspace";
import {messagingConnectionsActionStepId,messagingConnectionsStepId,resolveMessagingConnectionsFlow} from "@/src/modules/messaging/application/commands/messaging-connections-flow";
import {MESSAGING_PUBLIC_CHANNEL,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {AdmissionRouteError} from "@/components/academy-admissions/admission-route-error";
import type {MessagingConnectionsPageState} from "@/src/modules/messaging/application/results/messaging-connections-page-state";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingConnectionsBrowserClient} from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import type {MessagingConnectionsIntentStore,MessagingConnectionsPendingIntent,MessagingDiagnosticObservationReference} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {messagingConnectionsBrowserClient} from "@/lib/messaging/messaging-connections-api-client";
import {messagingConnectionsIntentStore} from "@/lib/messaging/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_BROWSER_PHASE as PHASE,MESSAGING_CONNECTIONS_UI_COPY as COPY,MESSAGING_CREDENTIAL_CHECK_UI_COPY as CHECK_COPY,MESSAGING_CONNECTIONS_WRITE_ACTION as WRITE_ACTION,type MessagingConnectionsWriteAction,MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {activateCandidate,archiveOriginal,checkConnectionsViewer,clearEarlierDiagnostics,configureChannel,isDiagnosticIntent,issueDiagnostic,observeResource,pendingCopyFor,performLifecycle,readCurrentConnection,readDiagnosticDelivery,readIssuedDiagnostic,recoverOriginal,replaceCandidateKey,restoreConnections,restoreHistory,resumeOriginal,saveConnection,validateCredential,verifyDiagnostic,type ConnectionsContext,type ConnectionsPhase,type ConnectionsReady,type CredentialFieldErrors,type IssuedDiagnostic,type LeaderConfiguration} from "./messaging-connections-operations";

/** Own ports may be injected; real auth/shared UI remain the production defaults. */
type ContainerProps={initialState:MessagingConnectionsPageState;client?:MessagingConnectionsBrowserClient;store?:MessagingConnectionsIntentStore;resourcesClient?:MessagingResourcesBrowserClient;diagnosticClient?:MessagingDiagnosticBrowserClient;activationClient?:MessagingActivationBrowserClient;lifecycleClient?:MessagingLifecycleBrowserClient};

/** @param ready - Server snapshot, when readable. @returns Every state of the connections route, opened where the server-rendered next step points. */
function useConnectionsState(ready:ConnectionsReady|null){
  /** Resuming opens the first pending step of the server-rendered snapshot (or Security when that is where it is resolved), so SSR and hydration agree. */
  const initialAction=ready?.configuration.audience===TRIBE_MEMBER_ROLE.leader?resolveMessagingConnectionsNextAction({...ready.configuration,observedAt:ready.renderedAt}):null;
  const[currentStepId,setCurrentStepId]=useState(()=>(initialAction&&messagingConnectionsActionStepId(initialAction))??messagingConnectionsStepId(STEP_KIND.activation));
  const[securityOpen,setSecurityOpen]=useState(()=>initialAction?.target?.kind==="security");
  /** Security opened by the next action manages the candidate it names; retirement is preselected only for a separate candidate, since retiring a shared one also retires the selection. The leader still confirms. */
  const initialLeader=ready?.configuration.audience===TRIBE_MEMBER_ROLE.leader?ready.configuration:null,initialCandidate=initialLeader?.candidate??null,initialLifecycleTarget=initialAction?.target?.kind==="security"&&initialCandidate?{id:initialCandidate.id,retire:initialCandidate.id!==initialLeader?.selected?.id}:null;
  /** When the current configuration was observed: the SSR time first (deterministic hydration), then each authoritative read. */
  const[observedAt,setObservedAt]=useState(()=>ready?.renderedAt??new Date(0).toISOString());
  const[configuration,setConfiguration]=useState<MessagingConfigurationResult|null>(ready?.configuration??null),[name,setName]=useState(""),[apiKey,setApiKey]=useState(""),[confirmed,setConfirmed]=useState(false),[validationConfirmed,setValidationConfirmed]=useState(false),[needsCurrent,setNeedsCurrent]=useState(false),[canResume,setCanResume]=useState(false),[resumeConfirmed,setResumeConfirmed]=useState(false),[canArchive,setCanArchive]=useState(false),[archiveConfirmed,setArchiveConfirmed]=useState(false),[history,setHistory]=useState<MessagingConnectionsPendingIntent[]>([]),[phase,setPhase]=useState<ConnectionsPhase>(PHASE.checking),[notice,setNotice]=useState<string|null>(null),[fieldErrors,setFieldErrors]=useState<CredentialFieldErrors>({}),[pending,setPending]=useState<MessagingConnectionsPendingIntent|null>(null);
  /** Whether the last explicit current read failed: a transient read error shown beside its button, never proof that the connection changed. */
  const[currentReadFailed,setCurrentReadFailed]=useState(false);
  /** Whether Consultar conexión actual is the read in flight, so only that control shows progress. */
  const[readingCurrent,setReadingCurrent]=useState(false);
  /** The pressed write; it only counts while the writing phase lasts, so reads never show it. */
  const[writingAction,setWritingAction]=useState<MessagingConnectionsWriteAction|null>(null);
  const[recoveryBusy,setRecoveryBusy]=useState(false);
  const[diagnosticReferences,setDiagnosticReferences]=useState<MessagingDiagnosticObservationReference[]>([]);
  /** Consent to retire the candidate from the Clave step, keyed to its exact id and version so any change asks again. */
  const[replacementScope,setReplacementScope]=useState("");
  /** Whether the key form just replaced a retired candidate and should receive the focus that its removed button held. */
  const[focusKey,setFocusKey]=useState(false);
  /** Counts saves rejected by field validation, so the form moves focus to the first field to fix. */
  const[validationAttempt,setValidationAttempt]=useState(0);
  /**
   * A recovered test waiting to be accepted once the configuration read with it is rendered, so it is compared with that configuration.
   * Each deferral gets its own wrapper, so the same result deferred twice is accepted twice and the accepting effect needs no reset.
   */
  const[recoveredIssuance,setRecoveredIssuance]=useState<{result:IssuedDiagnostic}|null>(null);
  /** @param result - Recovered test to accept after the next render. @returns Nothing after queuing it. */
  const deferRecoveredIssuance=useCallback((result:IssuedDiagnostic)=>setRecoveredIssuance({result}),[]);
  return{recoveredIssuance,deferRecoveredIssuance,initialLifecycleTarget,currentStepId,setCurrentStepId,securityOpen,setSecurityOpen,observedAt,setObservedAt,configuration,setConfiguration,name,setName,apiKey,setApiKey,confirmed,setConfirmed,validationConfirmed,setValidationConfirmed,needsCurrent,setNeedsCurrent,canResume,setCanResume,resumeConfirmed,setResumeConfirmed,canArchive,setCanArchive,archiveConfirmed,setArchiveConfirmed,history,setHistory,phase,setPhase,notice,setNotice,fieldErrors,setFieldErrors,pending,setPending,currentReadFailed,setCurrentReadFailed,readingCurrent,setReadingCurrent,writingAction,setWritingAction,recoveryBusy,setRecoveryBusy,diagnosticReferences,setDiagnosticReferences,replacementScope,setReplacementScope,focusKey,setFocusKey,validationAttempt,setValidationAttempt};
}
/** Every state of the connections route. */
type ConnectionsState=ReturnType<typeof useConnectionsState>;

/** @param ready - Server snapshot, when readable. @param state - Route state. @returns The candidate, provider channels, next action, shared block (also while the platform cannot protect any write) and the candidate whose key the Clave step can replace. */
function connectionsFacts(ready:ConnectionsReady|null,state:ConnectionsState){
  const leader=state.configuration?.audience===TRIBE_MEMBER_ROLE.leader?state.configuration:null,candidate=leader?.candidate??null;
  /** Every write of this page waits for the TuTribu team while the current read reports a platform requirement. */
  const platformBlocked=Boolean(leader?.platformRequirement);
  /** The candidate whose key the Clave step can replace: a separate candidate, never the selection the academy uses now. */
  const replaceable=candidate&&candidate.id!==leader?.selected?.id&&candidate.state!==MESSAGING_CONNECTION_STATE.disconnected?candidate:null;
  return{
    candidate,providerChannels:ready?.providerCatalog?.[0]?.channels??[],
    /** The single highlighted action, from the current own metadata at its observation time. */
    nextAction:leader?resolveMessagingConnectionsNextAction({...leader,observedAt:state.observedAt}):null,
    usage:leader?leader.usage:{state:"not_configured" as const,policy:null},
    platformBlocked,
    blocked:state.recoveryBusy||!ready||state.phase!==PHASE.idle||Boolean(state.pending)||state.needsCurrent||platformBlocked,
    replaceable,replacementKey:replaceable?`${replaceable.id}:${replaceable.version}`:"",
  };
}

/** @param context - Current render facts, read only when an action runs. @returns The explicit operations the presenters call. */
function connectionsActions(context:()=>ConnectionsContext){
  return{
    save:()=>saveConnection(context()),validate:()=>validateCredential(context()),recover:()=>recoverOriginal(context()),
    resume:()=>resumeOriginal(context()),archive:()=>archiveOriginal(context()),readCurrent:()=>readCurrentConnection(context()),
    replaceKey:()=>replaceCandidateKey(context()),clearEarlier:()=>clearEarlierDiagnostics(context()),
    readIssued:(reference:MessagingDiagnosticObservationReference)=>readIssuedDiagnostic(context(),reference),
    restoreHistory:(original:MessagingConnectionsPendingIntent)=>restoreHistory(context(),original),
    checkViewer:(signal:AbortSignal)=>checkConnectionsViewer(context(),signal),
  };
}

/** Render facts every presenter of the route reads. */
type ConnectionsView=ReturnType<typeof connectionsFacts>&{
  ready:ConnectionsReady;state:ConnectionsState;actions:ReturnType<typeof connectionsActions>;recoveryBusyChanged:(active:boolean)=>void;
  resourceController:ReturnType<typeof useMessagingResourceController>;diagnosticController:ReturnType<typeof useMessagingDiagnosticController>;
  activationController:ReturnType<typeof useMessagingActivationController>;lifecycleController:ReturnType<typeof useMessagingLifecycleController>;
  pendingAction:MessagingConnectionsWriteAction|null;isBusy:boolean;blockedActions:boolean;
};

/** @param view - Route render facts. @returns The key and check form, with the Clave step reachable while a separate candidate key can be replaced. */
function renderConnectionPanel({state,actions,replaceable,pendingAction,isBusy,platformBlocked}:ConnectionsView){
  const configuration=state.configuration as MessagingConfigurationResult,canSave=!state.pending&&!state.needsCurrent&&!isBusy&&!platformBlocked;
  // A key rejected by Zavu or sealed under a previous platform security is replaced from Clave; a proven current key is not.
  const onReplaceKey=replaceable&&(replaceable.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid||!replaceable.securityCurrent)?()=>{if(!isBusy)state.setCurrentStepId(messagingConnectionsStepId(STEP_KIND.key));}:undefined;
  return<MessagingConnections configuration={configuration} name={state.name} apiKey={state.apiKey} confirmed={state.confirmed} busy={isBusy||platformBlocked} saving={pendingAction===WRITE_ACTION.saveConnection} validating={pendingAction===WRITE_ACTION.validateCredential} canSave={canSave} validationAttempt={state.validationAttempt} validationConfirmed={state.validationConfirmed} canValidate={canSave&&state.validationConfirmed} fieldErrors={state.fieldErrors} onNameChange={(value)=>{state.setResumeConfirmed(false);state.setName(value);state.setFieldErrors((current)=>({...current,name:undefined}));}} focusKey={state.focusKey} onApiKeyChange={(value)=>{state.setResumeConfirmed(false);state.setFocusKey(false);state.setApiKey(value);state.setFieldErrors((current)=>({...current,apiKey:undefined}));}} onConfirmationChange={(value)=>{state.setConfirmed(value);state.setFieldErrors((current)=>({...current,confirmation:undefined}));}} onValidationConfirmationChange={(value)=>{state.setValidationConfirmed(value);}} onValidate={()=>{void actions.validate();}} onSave={()=>{void actions.save();}} onReplaceKey={onReplaceKey} />;
}

/** @param pending - Unresolved original. @param writingOriginal - Whether another write of the flow runs. @param notice - Persistent explanation. @param needsCurrent - Whether the configuration must be read again. @returns The explanation shown above the flow, if any. */
function attentionNoticeFor(pending:MessagingConnectionsPendingIntent|null,writingOriginal:boolean,notice:string|null,needsCurrent:boolean):string|null{
  if(pending)return writingOriginal?null:notice??pendingCopyFor(pending);
  return needsCurrent?CHECK_COPY.stale:null;
}

/** Pending originals stay above the tabs: they block every step and must not hide behind one. A pressed continuation stays mounted while it runs. @param view - Route render facts. @returns The attention block, or null when nothing waits. */
function renderAttention({state,actions,pendingAction,isBusy}:ConnectionsView){
  const{pending}=state,resuming=pendingAction===WRITE_ACTION.resumeOriginal,archiving=pendingAction===WRITE_ACTION.archiveOriginal;
  // A pending original stays above the flow, also while its own write runs (its recovery is disabled then); the persistent explanation appears once that write settles.
  const attentionNotice=attentionNoticeFor(pending,state.phase===PHASE.writing&&!resuming&&!archiving,state.notice,state.needsCurrent);
  if(!pending&&!attentionNotice)return null;
  const resumable=state.canResume||resuming,savesKey=pending?.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials;
  return<MessagingConnectionsAttention notice={attentionNotice}>{pending&&<div><Button variant="secondary" disabled={isBusy} onClick={()=>{void actions.recover();}}>Consultar guardado</Button></div>}{pending&&(state.canArchive||resuming||archiving)&&<MessagingOriginalRecovery diagnostic={isDiagnosticIntent(pending)} requiresKey={savesKey&&resumable} resumable={resumable} confirmed={state.resumeConfirmed} archiveConfirmed={state.archiveConfirmed} busy={isBusy} resuming={resuming} archiving={archiving} canResume={state.resumeConfirmed&&(!savesKey||Boolean(state.apiKey.trim()))} onConfirm={state.setResumeConfirmed} onArchiveConfirm={state.setArchiveConfirmed} onArchive={()=>{void actions.archive();}} onResume={()=>{void actions.resume();}} />}</MessagingConnectionsAttention>;
}

/** @param view - Route render facts. @param leader - Current leader configuration. @param connectionPanel - Key and check form. @returns The Clave step: the replacement of a separate candidate key, a note once a key is saved, or the key form. */
function renderKeyStep(view:ConnectionsView,leader:LeaderConfiguration,connectionPanel:ReactNode){
  const{state,replaceable,replacementKey,blockedActions,pendingAction,candidate,actions}=view;
  if(replaceable)return<MessagingCandidateKeyReplacement candidateName={replaceable.name} credentialLabel={MESSAGING_CREDENTIAL_LABEL[replaceable.credentialState]} selectedName={leader.selected?.name??null} confirmed={state.replacementScope===replacementKey} busy={blockedActions} replacing={pendingAction===WRITE_ACTION.replaceCandidateKey} canReplace={!blockedActions} onConfirm={(value)=>state.setReplacementScope(value?replacementKey:"")} onReplace={()=>{void actions.replaceKey();}} />;
  return candidate?<MessagingConnectionsStepNote>{FLOW_COPY.savedKey}</MessagingConnectionsStepNote>:connectionPanel;
}

/** @param view - Route render facts. @returns The channel step wired to its resource controller. */
function renderChannelsStep({resourceController,providerChannels,blockedActions,pendingAction}:ConnectionsView){
  return<MessagingConnectionResources availableChannels={providerChannels} {...resourceController.draft} confirmed={resourceController.confirmed} busy={blockedActions} saving={pendingAction===WRITE_ACTION.configureChannel} canSave={resourceController.canSave} senders={resourceController.senders} templates={resourceController.templates} sendersList={resourceController.sendersList} templatesList={resourceController.templatesList} reading={resourceController.reading} fieldErrors={resourceController.fieldErrors} message={null} onChannelChange={(next)=>resourceController.change({channel:next,senderId:"",templateId:"",templateLanguage:""})} onSenderChange={(senderId)=>resourceController.change({...resourceController.draft,senderId})} onTemplateChange={resourceController.chooseTemplate} onTemplateLanguageChange={(templateLanguage)=>resourceController.change({...resourceController.draft,templateLanguage})} onConfirmationChange={resourceController.confirm} onReadSenders={()=>{void resourceController.readSenders();}} onMoreSenders={()=>{void resourceController.moreSenders();}} onReadTemplates={()=>{void resourceController.readTemplates();}} onMoreTemplates={()=>{void resourceController.moreTemplates();}} onSave={()=>{void resourceController.save();}} />;
}

/** Public channel of a test step. */
type PublicChannel=typeof MESSAGING_PUBLIC_CHANNEL[keyof typeof MESSAGING_PUBLIC_CHANNEL];

/** @param view - Route render facts. @param channel - Channel of the open test step. @returns The issued test that belongs to it; SMS and WhatsApp share the phone challenge, so either step can replace it. */
function diagnosticFor({diagnosticController}:ConnectionsView,channel:PublicChannel){
  const diagnostic=diagnosticController.diagnostic;
  return diagnostic&&(diagnostic.channel===channel||diagnostic.channel!==MESSAGING_PUBLIC_CHANNEL.email&&channel!==MESSAGING_PUBLIC_CHANNEL.email)?diagnostic:null;
}

/** @param view - Route render facts. @param leader - Current leader configuration. @param channel - Channel of the open test step. @returns The test step wired to its diagnostic controller. */
function renderTestStep(view:ConnectionsView,leader:LeaderConfiguration,channel:PublicChannel){
  const{diagnosticController,blockedActions,pendingAction,state}=view,usageHref=`/${encodeURIComponent(view.ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`;
  // A test whose channel was already confirmed after it was issued no longer waits for its code.
  const diagnostic=diagnosticFor(view,channel),settled=Boolean(diagnostic&&diagnosticController.diagnostic&&isMessagingDiagnosticSettled(diagnosticController.diagnostic,view.candidate));
  const historyOpen=state.diagnosticReferences.length<MESSAGING_CONNECTION_HISTORY_LIMIT;
  return<MessagingConnectionDiagnostic channelLocked channel={diagnosticController.draft.channel} recipient={diagnosticController.draft.recipient} country={diagnosticController.draft.country} verificationCode={diagnosticController.verificationCode} confirmed={diagnosticController.confirmed} busy={blockedActions} issuing={pendingAction===WRITE_ACTION.issueDiagnostic} resending={pendingAction===WRITE_ACTION.resendDiagnostic} verifying={pendingAction===WRITE_ACTION.verifyDiagnostic} canIssue={diagnosticController.canIssue&&diagnosticController.draft.channel===channel&&historyOpen} canVerify={diagnosticController.canVerify&&!settled} canResend={diagnosticController.canResend&&!settled&&historyOpen} verified={diagnosticController.verified||settled} expiresInSeconds={settled?null:diagnosticController.expiresInSeconds} resendInSeconds={settled?null:diagnosticController.resendInSeconds} resendBlock={settled?null:diagnosticController.resendBlock} allowedCountries={diagnosticController.allowedCountries} usage={leader.usage} diagnostic={diagnostic} delivery={diagnostic?diagnosticController.delivery:null} fieldErrors={diagnosticController.fieldErrors} usageHref={usageHref} onChannelChange={(next)=>diagnosticController.change({channel:next,recipient:"",country:""})} onRecipientChange={(recipient)=>diagnosticController.change({...diagnosticController.draft,recipient})} onCountryChange={(country)=>diagnosticController.change({...diagnosticController.draft,country})} onCodeChange={diagnosticController.code} onConfirm={diagnosticController.confirm} onIssue={()=>{void diagnosticController.issue();}} onResend={()=>{void diagnosticController.resend();}} onVerify={()=>{void diagnosticController.verify();}} onReadDelivery={()=>{void diagnosticController.readDelivery();}} />;
}

/** Kind and channel of one flow step. */
type FlowStep=ReturnType<typeof resolveMessagingConnectionsFlow>[number];

/** @param view - Route render facts. @param leader - Current leader configuration. @param step - Open step. @param context - Key form and the advisory next step. @returns The wired panel for that single decision. */
function renderStepContent(view:ConnectionsView,leader:LeaderConfiguration,step:FlowStep,context:{connectionPanel:ReactNode;activeNext:boolean}){
  const{kind,channel}=step,{candidate}=view;
  if(kind===STEP_KIND.key)return renderKeyStep(view,leader,context.connectionPanel);
  if(kind===STEP_KIND.credential)return candidate?context.connectionPanel:<MessagingConnectionsStepNote>{FLOW_COPY.keyRequired}</MessagingConnectionsStepNote>;
  if(!candidate)return<MessagingConnectionsStepNote>{kind===STEP_KIND.activation&&context.activeNext?FLOW_COPY.selectedActive:FLOW_COPY.keyRequired}</MessagingConnectionsStepNote>;
  if(kind===STEP_KIND.channels)return renderChannelsStep(view);
  // A test consumes the daily code quota: without Países y cupos the step explains it and links there instead of offering a send that the server rejects.
  if(kind===STEP_KIND.test&&leader.usage.state===MESSAGING_USAGE_POLICY_STATE.notConfigured)return<MessagingConnectionsUsageRequired usageHref={`/${encodeURIComponent(view.ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`} />;
  if(kind===STEP_KIND.test&&channel)return renderTestStep(view,leader,channel);
  return<MessagingConnectionActivation candidate={candidate} selected={leader.selected} confirmed={view.activationController.confirmed} busy={view.blockedActions} requirements={view.activationController.requirements} onConfirm={view.activationController.confirm} />;
}

/** @param view - Route render facts. @param leader - Current leader configuration. @returns The security section: lifecycle, preserved attempts and notification recovery. */
function renderSecurity({ready,state,actions,lifecycleController,blockedActions,pendingAction,isBusy,recoveryBusyChanged}:ConnectionsView,leader:LeaderConfiguration){
  const catalog=ready.notificationCatalog;
  return<><MessagingConnectionLifecycle connections={lifecycleController.connections} targetId={lifecycleController.targetId} retiring={lifecycleController.retiring} reason={lifecycleController.reason} confirmed={lifecycleController.confirmed} busy={blockedActions} acting={pendingAction===WRITE_ACTION.changeLifecycle} canAct={lifecycleController.canAct} onTarget={lifecycleController.targetChanged} onRetiring={lifecycleController.retiringChanged} onReason={lifecycleController.reasonChanged} onConfirm={lifecycleController.confirm} onAct={()=>{void lifecycleController.act();}} />{!state.pending&&state.history.length>0&&<MessagingConnectionsPreservedAttempts>{state.history.map((original)=><Button key={`${original.type}:${original.operationId}`} variant="secondary" size="sm" disabled={isBusy} onClick={()=>actions.restoreHistory(original)}>Consultar intento conservado</Button>)}</MessagingConnectionsPreservedAttempts>}<NotificationRecoveryContainer slug={ready.slug} viewerId={ready.viewerId} renderedAt={ready.renderedAt} initialCatalog={catalog?.status==="ready"?catalog.value:undefined} initialCatalogError={catalog?.status==="failed"?catalog.message:undefined} target={leader.selected} platformRequirement={leader.platformRequirement} blocked={state.phase!==PHASE.idle||Boolean(state.pending)||state.needsCurrent} viewerVerified={state.phase!==PHASE.checking} verifyViewer={actions.checkViewer} onBusyChange={recoveryBusyChanged} /></>;
}

/** @param done - Whether the selection is already active. @param replacing - Whether a separate candidate would replace the selection. @returns The label of the final action. */
function finalActionLabel(done:boolean,replacing:boolean):string{
  if(done)return FLOW_COPY.active;
  return replacing?FLOW_COPY.replace:FLOW_COPY.activate;
}

/** @param view - Route render facts. @param leader - Current leader configuration. @param connectionPanel - Key and check form. @returns The guided leader workspace. */
function renderLeaderWorkspace(view:ConnectionsView,leader:LeaderConfiguration,connectionPanel:ReactNode){
  const{state,candidate,isBusy,pendingAction,diagnosticController,lifecycleController,activationController,actions}=view;
  const diagnosticHistory=<MessagingDiagnosticHistory references={state.diagnosticReferences} busy={isBusy||Boolean(state.pending)} onRead={(reference)=>{void actions.readIssued(reference);}} onClearEarlier={actions.clearEarlier} />;
  const action=view.nextAction??resolveMessagingConnectionsNextAction({selected:leader.selected,candidate,usage:leader.usage,observedAt:state.observedAt,platformRequirement:leader.platformRequirement});
  const flow=resolveMessagingConnectionsFlow({selected:leader.selected,candidate,usage:leader.usage,observedAt:state.observedAt});
  // A step that left the flow (a channel reconfigured away) falls back to the step the next action points to.
  const actionStepId=messagingConnectionsActionStepId(action),foundIndex=flow.findIndex((step)=>step.id===state.currentStepId),currentIndex=foundIndex>=0?foundIndex:Math.max(0,flow.findIndex((step)=>step.id===actionStepId));
  const currentStep=flow[currentIndex];
  const actionInView=!state.securityOpen&&action.target?.kind!=="security"&&actionStepId===currentStep.id;
  /** @param index - Step chosen with Atrás or Siguiente. @returns Nothing after moving, with a test step's channel preselected; moving never sends, saves or activates. */
  const moveTo=(index:number)=>{const step=flow[index];if(!step||isBusy)return;state.setFocusKey(false);state.setCurrentStepId(step.id);if(step.channel)diagnosticController.preselect(step.channel);};
  /** @returns Nothing after opening exactly where the next action is resolved, with its channel preselected. */
  const openNextAction=()=>{if(action.target?.kind==="security"){if(candidate)lifecycleController.preselect(candidate.id,candidate.id!==leader.selected?.id);state.setSecurityOpen(true);return;}const index=flow.findIndex((step)=>step.id===actionStepId);state.setSecurityOpen(false);if(index>=0)moveTo(index);};
  const done=action.step===MESSAGING_CONNECTIONS_NEXT_STEP.active;
  // The first session check runs before the leader starts anything, so it names itself instead of an operation in progress.
  const busyReason=state.phase===PHASE.checking?FLOW_COPY.checkingSession:FLOW_COPY.busy;
  const steps=flow.map((step,index)=>({id:step.id,title:step.title,description:step.description,content:index===currentIndex?renderStepContent(view,leader,step,{connectionPanel,activeNext:done}):null,blockedReason:step.blockedReason??(isBusy&&index===currentIndex?busyReason:undefined)}));
  const replacing=Boolean(candidate&&leader.selected&&leader.selected.id!==candidate.id);
  const finalAction={label:finalActionLabel(done,replacing),loading:pendingAction===WRITE_ACTION.activateCandidate,disabled:done||!activationController.canActivate,onRun:()=>{void activationController.activate();}};
  return<MessagingConnectionsWorkspace selected={leader.selected} candidate={candidate} platformRequirement={leader.platformRequirement} nextAction={action} nextActionInView={actionInView} usageHref={`/${encodeURIComponent(view.ready.slug)}/${MESSAGING_USAGE_SETTINGS_SEGMENT}`} onNextAction={openNextAction} busy={isBusy} attention={renderAttention(view)} onReadCurrent={()=>{void actions.readCurrent();}} readingCurrent={state.readingCurrent} currentReadFailed={state.currentReadFailed} steps={steps} current={currentIndex} onCurrentChange={moveTo} finalAction={finalAction} recovery={diagnosticHistory} security={renderSecurity(view,leader)} securityOpen={state.securityOpen} onSecurityToggle={()=>state.setSecurityOpen((open)=>!open)} />;
}

/** Controllers of the guided steps, wired to the route operations. */
type ConnectionsControllers={actions:ReturnType<typeof connectionsActions>;recoveryBusyChanged:(active:boolean)=>void;resourceController:ReturnType<typeof useMessagingResourceController>;diagnosticController:ReturnType<typeof useMessagingDiagnosticController>;activationController:ReturnType<typeof useMessagingActivationController>;lifecycleController:ReturnType<typeof useMessagingLifecycleController>};

/** @param ready - Server snapshot, when readable. @param state - Route state. @param facts - Derived facts. @param ports - Resource transport and the current render facts read when an operation runs. @returns The four step controllers, the explicit route operations and the serialized interaction slot they share with notification recovery. */
function useConnectionsControllers(ready:ConnectionsReady|null,state:ConnectionsState,facts:ReturnType<typeof connectionsFacts>,ports:{resourcesClient:MessagingResourcesBrowserClient;context:()=>ConnectionsContext}):ConnectionsControllers&{busy:RefObject<boolean>}{
  const{candidate,usage,blocked}=facts,{context}=ports,renderedAt=ready?.renderedAt??new Date(0).toISOString();
  /** @param request - Explicit own read. @param settle - Local draft/page update after current viewer checks. @returns Nothing after one serialized observation. */
  function observe<Value>(request:(signal:AbortSignal)=>Promise<MessagingUsageBrowserResult<Value>>,settle:(outcome:MessagingUsageBrowserResult<Value>)=>void):Promise<void>{return observeResource(context(),request,settle);}
  const resourceController=useMessagingResourceController({candidate,slug:ready?.slug??"",client:ports.resourcesClient,availableChannels:facts.providerChannels,blocked,observe,configure:(draft)=>configureChannel(context(),draft),feedback:(next)=>{if(!state.pending&&!state.needsCurrent)toastMessagingRead(next);},conflict:()=>state.setNeedsCurrent(true)});
  const diagnosticController=useMessagingDiagnosticController({candidate,renderedAt,usage,blocked,issue:(destination,currentChallengeId)=>issueDiagnostic(context(),destination,currentChallengeId),verify:(diagnostic,code)=>verifyDiagnostic(context(),diagnostic,code),readDelivery:(diagnostic)=>readDiagnosticDelivery(context(),diagnostic),preferredChannel:facts.nextAction?.channel??null,feedback:()=>{}});
  const activationController=useMessagingActivationController({candidate,usage,renderedAt,blocked,activate:()=>activateCandidate(context()),feedback:()=>{}});
  const lifecycleController=useMessagingLifecycleController({configuration:state.configuration,initialTarget:state.initialLifecycleTarget,blocked,act:(connection,retiring,reason)=>performLifecycle(context(),{connection,retiring,reason})});
  const{setRecoveryBusy}=state,busy=useRef(false);
  /** @param active - Whether notification recovery owns the shared interaction lifetime. @returns Nothing after serializing sibling connection actions. */
  const recoveryBusyChanged=useCallback((active:boolean)=>{busy.current=active;setRecoveryBusy(active);},[busy,setRecoveryBusy]);
  return{busy,actions:connectionsActions(context),recoveryBusyChanged,resourceController,diagnosticController,activationController,lifecycleController};
}

/** @param props - Guarded own SSR state and browser ports. @returns First safe connection step with incremental results, preserved original reference and no route refresh. */
export function MessagingConnectionsContainer({initialState,client=messagingConnectionsBrowserClient,store=messagingConnectionsIntentStore,resourcesClient=messagingResourcesBrowserClient,diagnosticClient=messagingDiagnosticBrowserClient,activationClient=messagingActivationBrowserClient,lifecycleClient=messagingLifecycleBrowserClient}:ContainerProps){
  const ready=initialState.kind==="ready"?initialState:null;
  // Outside an App Router context (isolated renders) both hooks return null at runtime despite their types.
  const pathname=(usePathname() as string|null)??ROUTES.home,searchParams=useSearchParams() as ReadonlyURLSearchParams|null;
  const state=useConnectionsState(ready),facts=connectionsFacts(ready,state);
  const mounted=useRef(true),observation=useRef<AbortController|null>(null);
  /** First confirmed absence of the pending test seen in this view; it only counts the wait of a reference saved without its dispatch instant. */
  const firstDiagnosticAbsence=useRef<{operationId:string;observedAt:number}|null>(null);
  /** Outcome of the serialized operation in flight; its toast is shown once the operation settles. */
  const report=useRef<MessagingConnectionsFeedback|null>(null);
  const{busy,...controllers}=useConnectionsControllers(ready,state,facts,{resourcesClient,context:connectionsContext});
  /** @returns Current render facts, ports, refs and controllers; it is only built when an operation runs. */
  function connectionsContext():ConnectionsContext{return{...state,...facts,...controllers,ready,client,store,resourcesClient,diagnosticClient,activationClient,lifecycleClient,busy,mounted,observation,firstDiagnosticAbsence,report,deferIssuance:state.deferRecoveredIssuance};}
  /** Effect-only callbacks observe the latest viewer/controller without restarting restoration for a render-only identity change. */
  const restoreViewer=useEffectEvent((signal:AbortSignal)=>checkConnectionsViewer(connectionsContext(),signal));
  const restorationScope=useEffectEvent(()=>state);
  // A recovered test is accepted by the controller of the render that already shows the configuration it was read with: in the same tick as
  // that read, the controller would still compare it with the earlier snapshot (Atrás restores an older one) and then reset it for the new scope.
  const{recoveredIssuance}=state,acceptedIssuance=useRef<typeof recoveredIssuance>(null),acceptRecoveredIssuance=useEffectEvent((result:IssuedDiagnostic)=>controllers.diagnosticController.acceptIssuance(result));
  useEffect(()=>{if(!recoveredIssuance||acceptedIssuance.current===recoveredIssuance)return;acceptedIssuance.current=recoveredIssuance;acceptRecoveredIssuance(recoveredIssuance.result);},[recoveredIssuance]);
  useEffect(()=>{mounted.current=true;const controller=new AbortController(),operations=observation;const scope=ready?{...restorationScope(),ready,client,store,mounted,checkViewer:(signal:AbortSignal)=>restoreViewer(signal),acceptIssuance:restorationScope().deferRecoveredIssuance}:null;
    if(scope)void restoreConnections(scope,controller.signal).catch(()=>{if(controller.signal.aborted||!mounted.current)return;scope.setApiKey("");scope.setPhase(PHASE.unavailable);scope.setNotice(COPY.storageUnavailable);});
    return()=>{mounted.current=false;controller.abort();operations.current?.abort();};},[ready,client,store]);
  if(!ready||state.phase===PHASE.unavailable)return<AdmissionRouteError embedded {...resolveMessagingRouteRecovery(initialState.kind==="unavailable"?initialState.code:null,{pathname,search:searchParams?.toString()??""})} message={initialState.kind==="unavailable"?initialState.message:state.notice??COPY.viewerChanged} />;
  if(!state.configuration)return null;
  const pendingAction=state.phase===PHASE.writing?state.writingAction:null,isBusy=state.recoveryBusy||state.phase!==PHASE.idle;
  const view:ConnectionsView={...facts,...controllers,ready,state,pendingAction,isBusy,blockedActions:isBusy||Boolean(state.pending)||state.needsCurrent||facts.platformBlocked};
  const connectionPanel=renderConnectionPanel(view);
  if(state.configuration.audience!==TRIBE_MEMBER_ROLE.leader)return connectionPanel;
  return renderLeaderWorkspace(view,state.configuration,connectionPanel);
}
