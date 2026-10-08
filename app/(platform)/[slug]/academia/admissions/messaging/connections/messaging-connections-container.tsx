"use client";
/** Owns ephemeral key entry, current viewer checks and original-result recovery; the presenter never owns HTTP/auth/storage. @module messaging-connections-container */
import {useEffect,useRef,useState} from "react";
import {Button,toast} from "beez-ui";
import {Link} from "@/components/navigation/link";
import {MessagingOriginalRecovery} from "@/components/academy-admissions/messaging-original-recovery";
import {MessagingConnectionResources} from "@/components/academy-admissions/messaging-connection-resources";
import {useMessagingResourceController} from "./messaging-resource-controller";
import {messagingResourcesBrowserClient} from "@/lib/messaging/messaging-resources-api-client";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import {validateMessagingChannelDraft,type MessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {MESSAGING_RESOURCE_UI_COPY as RESOURCE_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {MessagingConnections} from "@/components/academy-admissions/messaging-connections";
import {AdmissionRouteError} from "@/components/academy-admissions/admission-route-error";
import type {MessagingConnectionsPageState} from "@/src/modules/messaging/application/results/messaging-connections-page-state";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingConnectionMutationResult} from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import type {MessagingConnectionsBrowserClient} from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import type {MessagingConnectionsIntentStore,MessagingConnectionsPendingIntent} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import type {ReauthenticationIntentBrowserClient} from "@/src/modules/auth/application/ports/reauthentication-intent-browser-client";
import {messagingConnectionsBrowserClient} from "@/lib/messaging/messaging-connections-api-client";
import {messagingConnectionsIntentStore} from "@/lib/messaging/messaging-connections-intent-store";
import {createReauthenticationIntentBrowserClient} from "@/src/modules/auth/infrastructure/reauthentication-intent-browser-client";
import {MESSAGING_CONNECTIONS_BROWSER_PHASE as PHASE,MESSAGING_CONNECTIONS_UI_COPY as COPY,MESSAGING_CONNECTIONS_SETTINGS_SEGMENT,MESSAGING_CREDENTIAL_CHECK_UI_COPY as CHECK_COPY,MESSAGING_CONNECTION_RECOVERY_UI_COPY as RECOVERY_COPY} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_INITIAL_PROVIDER_ID,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {newAdmissionOperationId} from "@/lib/academy-admissions/admission-draft";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_ERROR_MESSAGE,MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {OPERATION_STATE} from "@/src/constants/operation-state";

/** Own ports may be injected; real auth/shared UI remain the production defaults. */
type ContainerProps={initialState:MessagingConnectionsPageState;client?:MessagingConnectionsBrowserClient;store?:MessagingConnectionsIntentStore;reauthentication?:ReauthenticationIntentBrowserClient;resourcesClient?:MessagingResourcesBrowserClient};
/** @param props - Guarded own SSR state and browser ports. @returns First safe connection step with incremental results, preserved original reference and no route refresh. */
export function MessagingConnectionsContainer({initialState,client=messagingConnectionsBrowserClient,store=messagingConnectionsIntentStore,reauthentication=createReauthenticationIntentBrowserClient(),resourcesClient=messagingResourcesBrowserClient}:ContainerProps){
  const ready=initialState.kind==="ready"?initialState:null;
  const[configuration,setConfiguration]=useState<MessagingConfigurationResult|null>(ready?.configuration??null),[name,setName]=useState(""),[apiKey,setApiKey]=useState(""),[confirmed,setConfirmed]=useState(false),[validationConfirmed,setValidationConfirmed]=useState(false),[needsCurrent,setNeedsCurrent]=useState(false),[canResume,setCanResume]=useState(false),[resumeConfirmed,setResumeConfirmed]=useState(false),[canArchive,setCanArchive]=useState(false),[archiveConfirmed,setArchiveConfirmed]=useState(false),[history,setHistory]=useState<MessagingConnectionsPendingIntent[]>([]),[phase,setPhase]=useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking),[message,setMessage]=useState<{kind:"status"|"alert";text:string}|null>(null),[fieldErrors,setFieldErrors]=useState<Partial<Record<"name"|"apiKey"|"confirmation",string>>>({}),[pending,setPending]=useState<MessagingConnectionsPendingIntent|null>(null),[reauthenticationHref,setReauthenticationHref]=useState<string|null>(null);
  const busy=useRef(false),mounted=useRef(true),observation=useRef<AbortController|null>(null);
  /** @param request - Explicit own read. @param settle - Local draft/page update after current viewer checks. @returns Nothing after one serialized observation, never an automatic retry. */
  async function observeResource<Value>(request:(signal:AbortSignal)=>Promise<MessagingUsageBrowserResult<Value>>,settle:(outcome:MessagingUsageBrowserResult<Value>)=>void):Promise<void>{
    if(!ready||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();
    try{if(!await checkViewer(controller.signal))return;const outcome=await request(controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;settle(outcome);}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  }
  const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;
  const resourceController=useMessagingResourceController({candidate,slug:ready?.slug??"",client:resourcesClient,blocked:!ready||phase!==PHASE.idle||Boolean(pending)||needsCurrent,observe:observeResource,configure:(draft)=>configureChannel(draft),feedback:(next)=>{if(!pending&&!needsCurrent)setMessage(next);},conflict:()=>setNeedsCurrent(true)});
  /** @param signal - Current operation observation. @returns Whether the same SSR viewer remains current; role/resource authority is independently server-checked. */
  const checkViewer=async(signal:AbortSignal)=>{if(!ready)return false;const current=await client.viewer(signal);if(signal.aborted||!mounted.current)return false;if(current.status!=="ready"||current.value?.id!==ready.viewerId){setApiKey("");setConfirmed(false);setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.viewerChanged});return false;}return true;};
  /** @param intent - Metadata reference, never the input key. @returns Whether it was safely saved/cleared for this exact viewer/route. */
  const retain=(intent:MessagingConnectionsPendingIntent|null)=>{if(!ready||!store.write(ready.viewerId,ready.slug,intent)){setMessage({kind:"alert",text:intent===null?COPY.clearFailed:COPY.storageUnavailable});return false;}setPending(intent);if(intent===null){setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);}return true;};
  /** @param result - Original initial candidate metadata. @returns Nothing after applying only its incremental view facts and clearing private input. */
  const applyCreated=(result:MessagingConnectionMutationResult)=>{setApiKey("");setConfirmed(false);setConfiguration((current)=>current?.audience==="leader"?{...current,candidate:{...result,credentialState:MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated,credentialMode:MESSAGING_CREDENTIAL_MODE.unknown,capabilities:[]}}:current);if(retain(null))setMessage({kind:"status",text:COPY.saved});setPhase(PHASE.idle);};
  /** @returns Nothing after readonly reconciliation of the original reference, never a retry of the key. */
  const recover=async()=>{if(!ready||!pending||busy.current)return;busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);setMessage({kind:"status",text:COPY.reading});try{if(!await checkViewer(controller.signal))return;const result=await client.operation(ready.slug,pending.operationId,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.type===pending.type&&result.value.state===OPERATION_STATE.completed){const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready"){setConfiguration(current.value);setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();if(retain(null)){if(result.value.type===REAUTHENTICATION_OPERATION.validateMessagingConnection)setMessage(result.value.result.failureCode?{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.value.result.failureCode]}:{kind:"status",text:CHECK_COPY.recovered});else if(result.value.type===REAUTHENTICATION_OPERATION.configureMessagingConnection)setMessage({kind:"status",text:RESOURCE_COPY.recovered});else setMessage({kind:"status",text:COPY.saved});}setPhase(PHASE.idle);}else setMessage({kind:"alert",text:COPY.pending});return;}if(result.status==="ready"&&result.value.type===pending.type&&result.value.state===OPERATION_STATE.started||result.status==="failed"&&result.code===MESSAGING_ERROR_CODE.resourceUnavailable){
      const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status==="ready"){setConfiguration(current.value);setResumeConfirmed(false);setCanResume(Boolean(pending.original));setCanArchive(current.value.audience===TRIBE_MEMBER_ROLE.leader);setArchiveConfirmed(false);setMessage({kind:"alert",text:pending.original?RECOVERY_COPY.originalUnconfirmed:RECOVERY_COPY.originalMissing});}else{setCanResume(false);setMessage({kind:"alert",text:COPY.pending});}return;
    }setCanResume(false);setMessage({kind:"alert",text:COPY.pending});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}};
  useEffect(()=>{mounted.current=true;const controller=new AbortController();async function restore(){if(!ready)return;const viewer=await client.viewer(controller.signal);if(controller.signal.aborted||!mounted.current)return;if(viewer.status!=="ready"||viewer.value?.id!==ready.viewerId){setApiKey("");setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.viewerChanged});return;}setHistory(store.history(ready.viewerId,ready.slug));const intent=store.read(ready.viewerId,ready.slug);if(intent){setPending(intent);setMessage({kind:"status",text:COPY.pending});}setPhase(PHASE.idle);}void restore().catch(()=>{if(controller.signal.aborted||!mounted.current)return;setApiKey("");setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.storageUnavailable});});return()=>{mounted.current=false;controller.abort();observation.current?.abort();};},[ready,client,store]);
  /** @returns Nothing after field validation and a single explicit original write; lost responses preserve reference but erase the key. */
  const save=async()=>{
    if(!ready||busy.current||phase!==PHASE.idle||pending||needsCurrent||configuration?.audience!=="leader")return;
    const errors:typeof fieldErrors={};if(!name.trim())errors.name=COPY.nameRequired;else if(name.trim().length>ADMISSION_LIMIT.displayNameCharacters)errors.name=COPY.nameTooLong;if(!apiKey.trim())errors.apiKey=COPY.keyRequired;if(!confirmed)errors.confirmation=COPY.confirmationRequired;setFieldErrors(errors);if(Object.keys(errors).length)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setReauthenticationHref(null);
    try{if(!await checkViewer(controller.signal))return;const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.saveMessagingCredentials,operationId:newAdmissionOperationId(),original:{name:name.trim()}};if(!retain(intent))return;setPhase(PHASE.writing);setMessage({kind:"status",text:COPY.writing});const result=await client.create(ready.slug,{operationId:intent.operationId,confirmed:true,providerId:MESSAGING_INITIAL_PROVIDER_ID,name:name.trim(),apiKey:apiKey.trim()},controller.signal);if(controller.signal.aborted||!mounted.current)return;setApiKey("");if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.state===OPERATION_STATE.completed){applyCreated(result.value.result);toast.success(COPY.saved);return;}if(result.status==="failed"&&!result.uncertain){if(result.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))setMessage({kind:"alert",text:result.message});toast.error(result.message);}else setMessage({kind:"alert",text:COPY.pending});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @returns Nothing after one explicit candidate CAS check; its result cannot prepare or activate a channel. */
  const validate=async()=>{
    const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;
    if(!ready||!candidate||!validationConfirmed||busy.current||phase!==PHASE.idle||pending||needsCurrent)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setReauthenticationHref(null);
    try{
      if(!await checkViewer(controller.signal))return;
      const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.validateMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version}};if(!retain(intent))return;
      setPhase(PHASE.writing);setValidationConfirmed(false);resourceController.resetConfirmation();setMessage({kind:"status",text:CHECK_COPY.checking});
      const outcome=await client.validate(ready.slug,candidate.id,{operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){
        const result=outcome.value.result;
        if(result.configurationVersion!==candidate.configurationVersion){setMessage({kind:"alert",text:CHECK_COPY.pending});return;}
        setConfiguration((current)=>current?.audience===TRIBE_MEMBER_ROLE.leader&&current.candidate?.id===candidate.id&&current.candidate.configurationVersion===candidate.configurationVersion?{...current,candidate:{...current.candidate,version:result.version,credentialState:result.credentialState,credentialMode:result.credentialMode}}:current);
        if(retain(null))setMessage(result.failureCode?{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.failureCode]}:{kind:"status",text:CHECK_COPY.checked});
        return;
      }
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))setMessage({kind:"alert",text:outcome.message});}else setMessage({kind:"alert",text:CHECK_COPY.pending});
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @param draft - Explicit chosen references already confirmed by the controlled form. @returns Nothing after original versioned configuration and authoritative metadata reconciliation, without sending a message. */
  async function configureChannel(draft:MessagingChannelDraft):Promise<void>{
    const validation=validateMessagingChannelDraft(draft);
    if(!ready||!candidate||!validation.valid||busy.current||pending||needsCurrent||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();setReauthenticationHref(null);
    try{
      if(!await checkViewer(controller.signal))return;
      const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.configureMessagingConnection,operationId:newAdmissionOperationId(),original:{connectionId:candidate.id,configurationVersion:candidate.configurationVersion,expectedVersion:candidate.version,...validation.references}};if(!retain(intent))return;
      setPhase(PHASE.writing);setMessage({kind:"status",text:RESOURCE_COPY.writing});
      const outcome=await resourcesClient.configure({slug:ready.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion},{...validation.references,operationId:intent.operationId,expectedVersion:candidate.version,confirmed:true},controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed){
        // The minimal write cannot reconstruct all capability timestamps. Read the same owner instead of guessing them or refreshing the route.
        const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
        if(current.status==="ready"){setConfiguration(current.value);if(retain(null))setMessage({kind:"status",text:outcome.value.result.changed?RESOURCE_COPY.saved:RESOURCE_COPY.unchanged});}else setMessage({kind:"alert",text:RESOURCE_COPY.pending});return;
      }
      if(outcome.status==="failed"&&!outcome.uncertain){if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))setMessage({kind:"alert",text:outcome.message});}else setMessage({kind:"alert",text:RESOURCE_COPY.pending});
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  }
  /** @returns Nothing after an explicit original replay using preserved public input and renewed consent; keys remain ephemeral and no new UUID is created. */
  const resumeOriginal=async()=>{
    if(!ready||!pending?.original||!canResume||!resumeConfirmed||busy.current||phase!==PHASE.idle)return;
    if(pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials&&!apiKey.trim())return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.writing);setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);setReauthenticationHref(null);setMessage({kind:"status",text:RECOVERY_COPY.resuming});
    try{
      if(!await checkViewer(controller.signal))return;
      let outcome;
      if(pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials)outcome=await client.create(ready.slug,{operationId:pending.operationId,confirmed:true,providerId:MESSAGING_INITIAL_PROVIDER_ID,name:pending.original.name,apiKey:apiKey.trim()},controller.signal);
      else if(pending.type===REAUTHENTICATION_OPERATION.validateMessagingConnection)outcome=await client.validate(ready.slug,pending.original.connectionId,{operationId:pending.operationId,confirmed:true,expectedVersion:pending.original.expectedVersion},controller.signal);
      else{const{connectionId,configurationVersion,...original}=pending.original;outcome=await resourcesClient.configure({slug:ready.slug,connectionId,configurationVersion},{...original,operationId:pending.operationId,confirmed:true},controller.signal);}
      setApiKey("");if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      // Observe the original separately; a successful replay is never substituted for the current view.
      if(outcome.status==="ready"&&outcome.value.state===OPERATION_STATE.completed||outcome.status==="failed"&&outcome.uncertain)setMessage({kind:"status",text:RECOVERY_COPY.consultAgain});
      else setMessage({kind:"alert",text:outcome.status==="failed"?outcome.message:COPY.pending});
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @returns Nothing after explicit local archiving and a fresh authorized current read; no backend work is cancelled or rewritten. */
  const archiveOriginal=async()=>{
    if(!ready||!pending||!canArchive||!archiveConfirmed||busy.current||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setResumeConfirmed(false);setArchiveConfirmed(false);
    try{
      if(!await checkViewer(controller.signal))return;const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status!=="ready"||current.value.audience!==TRIBE_MEMBER_ROLE.leader){setMessage({kind:"alert",text:CHECK_COPY.currentUnavailable});return;}
      if(!store.archive(ready.viewerId,ready.slug,pending)){setMessage({kind:"alert",text:RECOVERY_COPY.archiveFailed});return;}
      setHistory((previous)=>previous.some((entry)=>entry.type===pending.type&&entry.operationId===pending.operationId)?previous:[...previous,pending]);setConfiguration(current.value);
      if(retain(null)){setNeedsCurrent(false);setMessage({kind:"status",text:RECOVERY_COPY.archived});}
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @param original - Preserved own history entry. @returns Nothing after restoring the same UUID for readonly observation, never a new write. */
  const restoreHistory=(original:MessagingConnectionsPendingIntent)=>{if(!ready||busy.current||pending||phase!==PHASE.idle)return;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();if(retain(original))setMessage({kind:"status",text:COPY.pending});};
  /** @returns Nothing after an explicit current metadata read; a stale CAS cannot be silently retried. */
  const readCurrent=async()=>{
    if(!ready||busy.current||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();setReauthenticationHref(null);setPhase(PHASE.recovering);setCanResume(false);setCanArchive(false);setArchiveConfirmed(false);setResumeConfirmed(false);setMessage({kind:"status",text:CHECK_COPY.readingCurrent});
    try{
      if(!await checkViewer(controller.signal))return;const current=await client.read(ready.slug,controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status==="ready"){setConfiguration(current.value);setNeedsCurrent(false);setMessage({kind:"status",text:pending?COPY.pending:CHECK_COPY.currentRead});}else{setNeedsCurrent(true);setMessage({kind:"alert",text:CHECK_COPY.currentUnavailable});}
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @returns Nothing after preparing one explicit global intent; no private input survives the navigation. */
  const confirmGoogle=async(operation:typeof REAUTHENTICATION_OPERATION.saveMessagingCredentials|typeof REAUTHENTICATION_OPERATION.validateMessagingConnection|typeof REAUTHENTICATION_OPERATION.configureMessagingConnection|typeof REAUTHENTICATION_OPERATION.readMessagingSenders|typeof REAUTHENTICATION_OPERATION.readMessagingTemplates=REAUTHENTICATION_OPERATION.saveMessagingCredentials,recoveryResourceId?:string)=>{const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;if(!ready||busy.current||needsCurrent||phase!==PHASE.idle||operation!==REAUTHENTICATION_OPERATION.saveMessagingCredentials&&!recoveryResourceId&&!candidate)return;busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);resourceController.resetConfirmation();setResumeConfirmed(false);setCanResume(false);setReauthenticationHref(null);setPhase(PHASE.confirming);setMessage({kind:"status",text:operation===REAUTHENTICATION_OPERATION.validateMessagingConnection?CHECK_COPY.confirming:operation===REAUTHENTICATION_OPERATION.saveMessagingCredentials?COPY.keyAfterReauthentication:RESOURCE_COPY.confirming});try{if(!await checkViewer(controller.signal))return;const result=await reauthentication.create({tribeId:ready.tribeId,resourceId:operation===REAUTHENTICATION_OPERATION.saveMessagingCredentials?ready.tribeId:recoveryResourceId??candidate!.id,operation,returnPath:`/${encodeURIComponent(ready.slug)}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`,confirmed:true},controller.signal);if(controller.signal.aborted||!mounted.current)return;if(result.status==="ready"){setReauthenticationHref(result.href);setMessage({kind:"status",text:COPY.reauthenticationReady});}else setMessage({kind:"alert",text:COPY.reauthenticationFailed});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}};
  if(!ready||phase===PHASE.unavailable)return<AdmissionRouteError embedded reset={()=>{window.location.reload();}} message={initialState.kind==="unavailable"?initialState.message:message?.text??COPY.viewerChanged} />;
  if(!configuration)return null;
  const isBusy=phase!==PHASE.idle,canSave=!pending&&!needsCurrent&&!isBusy&&Boolean(name.trim()&&apiKey.trim()&&confirmed);
  return<><MessagingConnections configuration={configuration} name={name} apiKey={apiKey} confirmed={confirmed} busy={isBusy} canSave={canSave} canReauthenticate={!pending&&!needsCurrent} validationConfirmed={validationConfirmed} canValidate={!pending&&!needsCurrent&&!isBusy&&validationConfirmed} fieldErrors={fieldErrors} message={message} onNameChange={(value)=>{setResumeConfirmed(false);setName(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,name:undefined}));}} onApiKeyChange={(value)=>{setResumeConfirmed(false);setApiKey(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,apiKey:undefined}));}} onConfirmationChange={(value)=>{setConfirmed(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,confirmation:undefined}));}} onValidationConfirmationChange={(value)=>{setValidationConfirmed(value);if(!pending&&!needsCurrent)setMessage(null);}} onValidate={()=>{void validate();}} onSave={()=>{void save();}} onReauthenticate={()=>{void confirmGoogle();}} onValidationReauthenticate={()=>{void confirmGoogle(REAUTHENTICATION_OPERATION.validateMessagingConnection);}} />{candidate&&configuration.audience===TRIBE_MEMBER_ROLE.leader&&<MessagingConnectionResources {...resourceController.draft} confirmed={resourceController.confirmed} busy={isBusy||Boolean(pending)||needsCurrent} canSave={resourceController.canSave} senders={resourceController.senders} templates={resourceController.templates} fieldErrors={resourceController.fieldErrors} message={null} onChannelChange={(channel)=>resourceController.change({channel,senderId:"",templateId:"",templateLanguage:""})} onSenderChange={(senderId)=>resourceController.change({...resourceController.draft,senderId})} onTemplateChange={resourceController.chooseTemplate} onTemplateLanguageChange={(templateLanguage)=>resourceController.change({...resourceController.draft,templateLanguage})} onConfirmationChange={resourceController.confirm} onReadSenders={()=>{void resourceController.readSenders();}} onMoreSenders={()=>{void resourceController.moreSenders();}} onReadTemplates={()=>{void resourceController.readTemplates();}} onMoreTemplates={()=>{void resourceController.moreTemplates();}} onSave={()=>{void resourceController.save();}} onReauthenticate={()=>{void confirmGoogle(REAUTHENTICATION_OPERATION.configureMessagingConnection);}} onReadSendersReauthenticate={()=>{void confirmGoogle(REAUTHENTICATION_OPERATION.readMessagingSenders);}} onReadTemplatesReauthenticate={()=>{void confirmGoogle(REAUTHENTICATION_OPERATION.readMessagingTemplates);}} />}{configuration.audience===TRIBE_MEMBER_ROLE.leader&&<Button type="button" variant="outline" disabled={isBusy} onClick={()=>{void readCurrent();}}>Consultar conexión actual</Button>}{pending&&<Button type="button" variant="outline" disabled={isBusy} onClick={()=>{void recover();}}>Consultar guardado</Button>}{pending&&canArchive&&<MessagingOriginalRecovery requiresKey={pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials&&canResume} resumable={canResume} confirmed={resumeConfirmed} archiveConfirmed={archiveConfirmed} busy={isBusy} canResume={resumeConfirmed&&(pending.type!==REAUTHENTICATION_OPERATION.saveMessagingCredentials||Boolean(apiKey.trim()))} onConfirm={setResumeConfirmed} onArchiveConfirm={setArchiveConfirmed} onArchive={()=>{void archiveOriginal();}} onResume={()=>{void resumeOriginal();}} onReauthenticate={()=>{void confirmGoogle(pending.type,pending.type===REAUTHENTICATION_OPERATION.saveMessagingCredentials?undefined:pending.original?.connectionId);}} />}{!pending&&history.length>0&&configuration.audience===TRIBE_MEMBER_ROLE.leader&&<section aria-label="Intentos conservados"><p>Estas referencias siguen disponibles para consultar el resultado original. Guardarlas no canceló ni repitió operaciones.</p>{history.map((original)=><Button key={`${original.type}:${original.operationId}`} type="button" variant="outline" disabled={isBusy} onClick={()=>restoreHistory(original)}>Consultar intento conservado</Button>)}</section>}{reauthenticationHref&&<p><Link href={reauthenticationHref}>Continuar con Google</Link></p>}</>;
}
