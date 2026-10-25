"use client";
/** Keeps diagnostic destination/code ephemeral and scoped while the route owns all authority, requests and original-operation coordination. @module messaging-diagnostic-controller */
import {useEffect,useState} from "react";
import type {z} from "zod";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import type {ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type {ConnectionDiagnosticSnapshot} from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import type {MessagingDiagnosticDestination,MessagingDiagnosticDraft,MessagingDiagnosticFieldErrors} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import {validateMessagingDiagnosticDraft,validateMessagingDiagnosticCode} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_DIAGNOSTIC_RESEND_BLOCK,MESSAGING_DIAGNOSTIC_UI_COPY,type MessagingDiagnosticResendBlock} from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import {VERIFICATION_ISSUANCE_OUTCOME} from "@/src/modules/academy-admissions/constants/verification-issuance";
import {CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME} from "@/src/modules/messaging/constants/connection-diagnostic";
import {MILLISECONDS_PER_SECOND} from "@/src/constants/time";
import {isMessagingDiagnosticSettled} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";

/** Issue/verify callbacks must remain explicit; this controller cannot fetch a session or invoke a provider. */
type DiagnosticControllerOptions={candidate:MessagingConfigurationConnection|null;/** Channel the next action asks to test; it starts the form for each candidate scope. */preferredChannel?:MessagingDiagnosticDraft["channel"]|null;usage:MessagingUsagePolicyStateDto;renderedAt:string;blocked:boolean;issue:(destination:MessagingDiagnosticDestination,currentChallengeId?:string)=>Promise<void>;verify:(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>,code:string)=>Promise<void>;readDelivery:(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>)=>Promise<void>;feedback:(message:{kind:"status"|"alert";text:string}|null)=>void};

/** @param options - Current own immutable scope, usage and route-owned actions. @returns Controlled fields and safe original results, without persistence, automatic sending or delivery-as-proof. */
export function useMessagingDiagnosticController(options:DiagnosticControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}`;
  const initial=()=>({scopeKey,draft:{channel:options.preferredChannel??MESSAGING_PUBLIC_CHANNEL.email,recipient:"",country:""} as MessagingDiagnosticDraft,touched:{} as Partial<Record<keyof MessagingDiagnosticFieldErrors,true>>,confirmed:false,verificationCode:"",diagnostic:null as Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>|null,verifiedDiagnosticId:null as string|null,delivery:null as z.infer<typeof messageDeliverySchema>|null});
  const[state,setState]=useState(initial);if(state.scopeKey!==scopeKey)setState(initial());const current=state.scopeKey===scopeKey?state:initial();
  const[nowMs,setNowMs]=useState(()=>Date.parse(options.renderedAt));
  // The countdowns only move while the current test has an expiry or a resend wait ahead; at rest the clock stops.
  const countdownEndsMs=current.diagnostic?Math.max(Date.parse(current.diagnostic.expiresAt),Date.parse(current.diagnostic.resendAllowedAt)):null,countdownRunning=countdownEndsMs!==null&&nowMs<countdownEndsMs;
  // The first tick reads the real clock at once: a code that already expired never shows a stale countdown.
  useEffect(()=>{if(!countdownRunning)return;const tick=()=>setNowMs(Date.now()),first=window.setTimeout(tick,0),timer=window.setInterval(tick,MILLISECONDS_PER_SECOND);return()=>{window.clearTimeout(first);window.clearInterval(timer);};},[countdownRunning]);
  const update=(patch:Partial<typeof state>)=>setState((previous)=>previous.scopeKey===scopeKey?{...previous,...patch}:previous);
  const allowedCountries=options.usage.policy?.allowedCountries??[],validation=validateMessagingDiagnosticDraft(current.draft,allowedCountries),codeMessage=validateMessagingDiagnosticCode(current.verificationCode),credentialValid=options.candidate?.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid;
  /** Field feedback appears only after the operator edits that field or attempts to send; a fresh form shows no errors. */
  const change=(draft:MessagingDiagnosticDraft)=>{if(options.blocked)return;const channelChanged=draft.channel!==current.draft.channel;update({draft,confirmed:false,touched:channelChanged?{}:{...current.touched,...(draft.recipient!==current.draft.recipient?{recipient:true}:{}),...(draft.country!==current.draft.country?{country:true}:{})}});options.feedback(null);};
  const visibleErrors:MessagingDiagnosticFieldErrors=Object.fromEntries(Object.entries(validation.fieldErrors).filter(([field])=>current.touched[field as keyof MessagingDiagnosticFieldErrors]));
  const verified=Boolean(current.diagnostic&&current.verifiedDiagnosticId===current.diagnostic.diagnosticId);
  const expiresInSeconds=current.diagnostic?Math.max(0,Math.ceil((Date.parse(current.diagnostic.expiresAt)-nowMs)/MILLISECONDS_PER_SECOND)):null,resendInSeconds=current.diagnostic?Math.max(0,Math.ceil((Date.parse(current.diagnostic.resendAllowedAt)-nowMs)/MILLISECONDS_PER_SECOND)):null;
  /** SMS and WhatsApp share one phone/contact namespace; replacing it stays an explicit consented resend. */
  const canReplaceChannel=Boolean(current.diagnostic)&&(current.diagnostic?.channel===current.draft.channel||current.diagnostic?.channel!==MESSAGING_PUBLIC_CHANNEL.email&&current.draft.channel!==MESSAGING_PUBLIC_CHANNEL.email);
  /** The destination is not kept after a send, so a resend waits for it again; the step names the missing piece instead of a silent disabled button. */
  const resendBlock:MessagingDiagnosticResendBlock|null=!current.diagnostic||verified||!credentialValid?null:resendInSeconds!==null&&resendInSeconds>0?MESSAGING_DIAGNOSTIC_RESEND_BLOCK.wait:!canReplaceChannel?MESSAGING_DIAGNOSTIC_RESEND_BLOCK.channel:!validation.valid?MESSAGING_DIAGNOSTIC_RESEND_BLOCK.destination:!current.confirmed?MESSAGING_DIAGNOSTIC_RESEND_BLOCK.consent:null;
  const issue=async(resend=false)=>{if(!options.blocked&&!validation.valid)update({touched:{recipient:true,country:true}});if(options.blocked||!credentialValid||!current.confirmed||!validation.valid)return;if(resend&&verified)return;const previous=resend?current.diagnostic:null;if(resend&&(!previous||!canReplaceChannel||resendInSeconds!==0))return;update({confirmed:false,verificationCode:""});await options.issue(validation.destination,previous?.challengeId);};
  const verify=async()=>{if(options.blocked||!current.diagnostic||verified||codeMessage||expiresInSeconds===0)return;const code=current.verificationCode;update({verificationCode:"",confirmed:false});await options.verify(current.diagnostic,code);};
  return{...current,verified,allowedCountries,expiresInSeconds:verified?null:expiresInSeconds,resendInSeconds:verified?null:resendInSeconds,resendBlock,fieldErrors:{...visibleErrors,...(current.verificationCode&&codeMessage?{verificationCode:codeMessage}:{})},canIssue:!options.blocked&&credentialValid&&current.confirmed&&validation.valid,canResend:!options.blocked&&!verified&&credentialValid&&current.confirmed&&validation.valid&&canReplaceChannel&&resendInSeconds===0,canVerify:!options.blocked&&Boolean(current.diagnostic)&&!verified&&!codeMessage&&expiresInSeconds!==0,
    change,confirm:(confirmed:boolean)=>{if(options.blocked)return;update({confirmed});options.feedback(null);},code:(verificationCode:string)=>{if(options.blocked)return;update({verificationCode});options.feedback(null);},
    /** Opens the form on one channel with an empty destination and no consent, as an explicit channel change would; the route calls it when a test step opens or after a confirmed code. */
    preselect:(channel:MessagingDiagnosticDraft["channel"])=>{if(current.draft.channel===channel)return;update({draft:{channel,recipient:"",country:""},touched:{},confirmed:false});},
    clearPrivate:()=>update({draft:{...current.draft,recipient:""},touched:{},verificationCode:"",confirmed:false}),
    issue:()=>issue(),resend:()=>issue(true),verify,readDelivery:async()=>{if(!options.blocked&&current.diagnostic)await options.readDelivery(current.diagnostic);},
    acceptIssuance:(result:ConnectionDiagnosticIssueResult)=>{if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued&&result.connectionId===options.candidate?.id&&result.connectionVersion===options.candidate.configurationVersion)update({diagnostic:result,verifiedDiagnosticId:null,draft:{...current.draft,channel:isMessagingDiagnosticSettled(result,options.candidate)?current.draft.channel:result.channel,recipient:""},touched:{},confirmed:false,verificationCode:"",delivery:null});},
    /** Retains success only for the exact issued diagnostic it confirms; another challenge or configuration stays unverified. */
    acceptVerification:(result:ConnectionDiagnosticSnapshot)=>{setState((previous)=>{if(previous.scopeKey!==scopeKey)return previous;const matches=result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified&&previous.diagnostic!==null&&result.diagnosticId===previous.diagnostic.diagnosticId&&result.connectionVersion===previous.diagnostic.connectionVersion&&result.channel===previous.diagnostic.channel;return{...previous,verificationCode:"",confirmed:false,...(matches?{verifiedDiagnosticId:result.diagnosticId}:{})};});if(result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified)options.feedback({kind:"status",text:MESSAGING_DIAGNOSTIC_UI_COPY.verified});},
    acceptDelivery:(delivery:z.infer<typeof messageDeliverySchema>)=>update({delivery}),
  };
}
