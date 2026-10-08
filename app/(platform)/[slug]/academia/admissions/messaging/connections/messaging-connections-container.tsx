"use client";
/** Owns ephemeral key entry, current viewer checks and original-result recovery; the presenter never owns HTTP/auth/storage. @module messaging-connections-container */
import {useEffect,useRef,useState} from "react";
import {Button,toast} from "beez-ui";
import {Link} from "@/components/navigation/link";
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
import {MESSAGING_CONNECTIONS_BROWSER_PHASE as PHASE,MESSAGING_CONNECTIONS_UI_COPY as COPY,MESSAGING_CONNECTIONS_SETTINGS_SEGMENT,MESSAGING_CREDENTIAL_CHECK_UI_COPY as CHECK_COPY} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_INITIAL_PROVIDER_ID,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "@/src/modules/messaging/constants/messaging-credential-validation";
import {newAdmissionOperationId} from "@/lib/academy-admissions/admission-draft";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_ERROR_MESSAGE,MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {OPERATION_STATE} from "@/src/constants/operation-state";

/** Own ports may be injected; real auth/shared UI remain the production defaults. */
type ContainerProps={initialState:MessagingConnectionsPageState;client?:MessagingConnectionsBrowserClient;store?:MessagingConnectionsIntentStore;reauthentication?:ReauthenticationIntentBrowserClient};
/** @param props - Guarded own SSR state and browser ports. @returns First safe connection step with incremental results, preserved original reference and no route refresh. */
export function MessagingConnectionsContainer({initialState,client=messagingConnectionsBrowserClient,store=messagingConnectionsIntentStore,reauthentication=createReauthenticationIntentBrowserClient()}:ContainerProps){
  const ready=initialState.kind==="ready"?initialState:null;
  const[configuration,setConfiguration]=useState<MessagingConfigurationResult|null>(ready?.configuration??null),[name,setName]=useState(""),[apiKey,setApiKey]=useState(""),[confirmed,setConfirmed]=useState(false),[validationConfirmed,setValidationConfirmed]=useState(false),[needsCurrent,setNeedsCurrent]=useState(false),[phase,setPhase]=useState<typeof PHASE[keyof typeof PHASE]>(PHASE.checking),[message,setMessage]=useState<{kind:"status"|"alert";text:string}|null>(null),[fieldErrors,setFieldErrors]=useState<Partial<Record<"name"|"apiKey"|"confirmation",string>>>({}),[pending,setPending]=useState<MessagingConnectionsPendingIntent|null>(null),[reauthenticationHref,setReauthenticationHref]=useState<string|null>(null);
  const busy=useRef(false),mounted=useRef(true),observation=useRef<AbortController|null>(null);
  /** @param signal - Current operation observation. @returns Whether the same SSR viewer remains current; role/resource authority is independently server-checked. */
  const checkViewer=async(signal:AbortSignal)=>{if(!ready)return false;const current=await client.viewer(signal);if(signal.aborted||!mounted.current)return false;if(current.status!=="ready"||current.value?.id!==ready.viewerId){setApiKey("");setConfirmed(false);setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.viewerChanged});return false;}return true;};
  /** @param intent - Metadata reference, never the input key. @returns Whether it was safely saved/cleared for this exact viewer/route. */
  const retain=(intent:MessagingConnectionsPendingIntent|null)=>{if(!ready||!store.write(ready.viewerId,ready.slug,intent)){setMessage({kind:"alert",text:intent===null?COPY.clearFailed:COPY.storageUnavailable});return false;}setPending(intent);return true;};
  /** @param result - Original initial candidate metadata. @returns Nothing after applying only its incremental view facts and clearing private input. */
  const applyCreated=(result:MessagingConnectionMutationResult)=>{setApiKey("");setConfirmed(false);setConfiguration((current)=>current?.audience==="leader"?{...current,candidate:{...result,credentialState:MESSAGING_CREDENTIAL_PUBLIC_STATE.notValidated,credentialMode:MESSAGING_CREDENTIAL_MODE.unknown,capabilities:[]}}:current);if(retain(null))setMessage({kind:"status",text:COPY.saved});setPhase(PHASE.idle);};
  /** @returns Nothing after readonly reconciliation of the original reference, never a retry of the key. */
  const recover=async()=>{if(!ready||!pending||busy.current)return;busy.current=true;const controller=new AbortController();observation.current=controller;setPhase(PHASE.recovering);setApiKey("");setMessage({kind:"status",text:COPY.reading});try{if(!await checkViewer(controller.signal))return;const result=await client.operation(ready.slug,pending.operationId,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.type===pending.type&&result.value.state===OPERATION_STATE.completed){const current=await client.read(ready.slug,controller.signal);if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;if(current.status==="ready"){setConfiguration(current.value);setApiKey("");setConfirmed(false);setValidationConfirmed(false);if(retain(null)){if(result.value.type===REAUTHENTICATION_OPERATION.validateMessagingConnection)setMessage(result.value.result.failureCode?{kind:"alert",text:MESSAGING_ERROR_MESSAGE[result.value.result.failureCode]}:{kind:"status",text:CHECK_COPY.recovered});else setMessage({kind:"status",text:COPY.saved});}setPhase(PHASE.idle);}else setMessage({kind:"alert",text:COPY.pending});return;}setMessage({kind:"alert",text:COPY.pending});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}};
  useEffect(()=>{mounted.current=true;const controller=new AbortController();async function restore(){if(!ready)return;const viewer=await client.viewer(controller.signal);if(controller.signal.aborted||!mounted.current)return;if(viewer.status!=="ready"||viewer.value?.id!==ready.viewerId){setApiKey("");setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.viewerChanged});return;}const intent=store.read(ready.viewerId,ready.slug);if(intent){setPending(intent);setMessage({kind:"status",text:COPY.pending});}setPhase(PHASE.idle);}void restore().catch(()=>{if(controller.signal.aborted||!mounted.current)return;setApiKey("");setPhase(PHASE.unavailable);setMessage({kind:"alert",text:COPY.storageUnavailable});});return()=>{mounted.current=false;controller.abort();observation.current?.abort();};},[ready,client,store]);
  /** @returns Nothing after field validation and a single explicit original write; lost responses preserve reference but erase the key. */
  const save=async()=>{
    if(!ready||busy.current||phase!==PHASE.idle||pending||needsCurrent||configuration?.audience!=="leader")return;
    const errors:typeof fieldErrors={};if(!name.trim())errors.name=COPY.nameRequired;else if(name.trim().length>ADMISSION_LIMIT.displayNameCharacters)errors.name=COPY.nameTooLong;if(!apiKey.trim())errors.apiKey=COPY.keyRequired;if(!confirmed)errors.confirmation=COPY.confirmationRequired;setFieldErrors(errors);if(Object.keys(errors).length)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setReauthenticationHref(null);
    try{if(!await checkViewer(controller.signal))return;const intent={type:REAUTHENTICATION_OPERATION.saveMessagingCredentials,operationId:newAdmissionOperationId()};if(!retain(intent))return;setPhase(PHASE.writing);setMessage({kind:"status",text:COPY.writing});const result=await client.create(ready.slug,{operationId:intent.operationId,confirmed:true,providerId:MESSAGING_INITIAL_PROVIDER_ID,name:name.trim(),apiKey:apiKey.trim()},controller.signal);if(controller.signal.aborted||!mounted.current)return;setApiKey("");if(!await checkViewer(controller.signal))return;if(result.status==="ready"&&result.value.state===OPERATION_STATE.completed){applyCreated(result.value.result);toast.success(COPY.saved);return;}if(result.status==="failed"&&!result.uncertain){if(result.code===MESSAGING_ERROR_CODE.connectionConflict)setNeedsCurrent(true);if(retain(null))setMessage({kind:"alert",text:result.message});toast.error(result.message);}else setMessage({kind:"alert",text:COPY.pending});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @returns Nothing after one explicit candidate CAS check; its result cannot prepare or activate a channel. */
  const validate=async()=>{
    const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;
    if(!ready||!candidate||!validationConfirmed||busy.current||phase!==PHASE.idle||pending||needsCurrent)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setReauthenticationHref(null);
    try{
      if(!await checkViewer(controller.signal))return;
      const intent:MessagingConnectionsPendingIntent={type:REAUTHENTICATION_OPERATION.validateMessagingConnection,operationId:newAdmissionOperationId()};if(!retain(intent))return;
      setPhase(PHASE.writing);setValidationConfirmed(false);setMessage({kind:"status",text:CHECK_COPY.checking});
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
  /** @returns Nothing after an explicit current metadata read; a stale CAS cannot be silently retried. */
  const readCurrent=async()=>{
    if(!ready||busy.current||pending||phase!==PHASE.idle)return;
    busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);setReauthenticationHref(null);setPhase(PHASE.recovering);setMessage({kind:"status",text:CHECK_COPY.readingCurrent});
    try{
      if(!await checkViewer(controller.signal))return;const current=await client.read(ready.slug,controller.signal);
      if(controller.signal.aborted||!mounted.current)return;if(!await checkViewer(controller.signal))return;
      if(current.status==="ready"){setConfiguration(current.value);setNeedsCurrent(false);setMessage({kind:"status",text:CHECK_COPY.currentRead});}else{setNeedsCurrent(true);setMessage({kind:"alert",text:CHECK_COPY.currentUnavailable});}
    }finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}
  };
  /** @returns Nothing after preparing one explicit global intent; no private input survives the navigation. */
  const confirmGoogle=async(operation:typeof REAUTHENTICATION_OPERATION.saveMessagingCredentials|typeof REAUTHENTICATION_OPERATION.validateMessagingConnection=REAUTHENTICATION_OPERATION.saveMessagingCredentials)=>{const candidate=configuration?.audience===TRIBE_MEMBER_ROLE.leader?configuration.candidate:null;if(!ready||busy.current||pending||needsCurrent||phase!==PHASE.idle||operation===REAUTHENTICATION_OPERATION.validateMessagingConnection&&!candidate)return;busy.current=true;const controller=new AbortController();observation.current=controller;setApiKey("");setConfirmed(false);setValidationConfirmed(false);setPhase(PHASE.confirming);setMessage({kind:"status",text:operation===REAUTHENTICATION_OPERATION.validateMessagingConnection?CHECK_COPY.confirming:COPY.keyAfterReauthentication});try{if(!await checkViewer(controller.signal))return;const result=await reauthentication.create({tribeId:ready.tribeId,resourceId:operation===REAUTHENTICATION_OPERATION.validateMessagingConnection?candidate!.id:ready.tribeId,operation,returnPath:`/${encodeURIComponent(ready.slug)}/${MESSAGING_CONNECTIONS_SETTINGS_SEGMENT}`,confirmed:true},controller.signal);if(controller.signal.aborted||!mounted.current)return;if(result.status==="ready"){setReauthenticationHref(result.href);setMessage({kind:"status",text:COPY.reauthenticationReady});}else setMessage({kind:"alert",text:COPY.reauthenticationFailed});}finally{busy.current=false;if(mounted.current)setPhase((current)=>current===PHASE.unavailable?current:PHASE.idle);}};
  if(!ready||phase===PHASE.unavailable)return<AdmissionRouteError embedded reset={()=>{window.location.reload();}} message={initialState.kind==="unavailable"?initialState.message:message?.text??COPY.viewerChanged} />;
  if(!configuration)return null;
  const isBusy=phase!==PHASE.idle,canSave=!pending&&!needsCurrent&&!isBusy&&Boolean(name.trim()&&apiKey.trim()&&confirmed);
  return<><MessagingConnections configuration={configuration} name={name} apiKey={apiKey} confirmed={confirmed} busy={isBusy} canSave={canSave} canReauthenticate={!pending&&!needsCurrent} validationConfirmed={validationConfirmed} canValidate={!pending&&!needsCurrent&&!isBusy&&validationConfirmed} fieldErrors={fieldErrors} message={message} onNameChange={(value)=>{setName(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,name:undefined}));}} onApiKeyChange={(value)=>{setApiKey(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,apiKey:undefined}));}} onConfirmationChange={(value)=>{setConfirmed(value);if(!pending&&!needsCurrent)setMessage(null);setFieldErrors((current)=>({...current,confirmation:undefined}));}} onValidationConfirmationChange={(value)=>{setValidationConfirmed(value);if(!pending&&!needsCurrent)setMessage(null);}} onValidate={()=>{void validate();}} onSave={()=>{void save();}} onReauthenticate={()=>{void confirmGoogle();}} onValidationReauthenticate={()=>{void confirmGoogle(REAUTHENTICATION_OPERATION.validateMessagingConnection);}} />{configuration.audience===TRIBE_MEMBER_ROLE.leader&&!pending&&<Button type="button" variant="outline" disabled={isBusy} onClick={()=>{void readCurrent();}}>Consultar conexión actual</Button>}{pending&&<Button type="button" variant="outline" disabled={isBusy} onClick={()=>{void recover();}}>Consultar guardado</Button>}{reauthenticationHref&&<p><Link href={reauthenticationHref}>Continuar con Google</Link></p>}</>;
}
