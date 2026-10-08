"use client";
/** Keeps diagnostic destination/code ephemeral and scoped while the route owns all authority, requests and original-operation coordination. @module messaging-diagnostic-controller */
import {useEffect,useState} from "react";
import type {z} from "zod";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import type {ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type {ConnectionDiagnosticSnapshot} from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import type {MessagingDiagnosticDestination,MessagingDiagnosticDraft} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import {validateMessagingDiagnosticDraft,validateMessagingDiagnosticCode} from "@/src/modules/messaging/application/commands/messaging-diagnostic-draft";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_PUBLIC_STATE} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_DIAGNOSTIC_UI_COPY} from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import {VERIFICATION_ISSUANCE_OUTCOME} from "@/src/modules/academy-admissions/constants/verification-issuance";
import {CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME} from "@/src/modules/messaging/constants/connection-diagnostic";
import {MILLISECONDS_PER_SECOND} from "@/src/constants/time";

/** Issue/verify callbacks must remain explicit; this controller cannot fetch a session or invoke a provider. */
type DiagnosticControllerOptions={candidate:MessagingConfigurationConnection|null;usage:MessagingUsagePolicyStateDto;renderedAt:string;blocked:boolean;issue:(destination:MessagingDiagnosticDestination,currentChallengeId?:string)=>Promise<void>;verify:(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>,code:string)=>Promise<void>;readDelivery:(diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>)=>Promise<void>;feedback:(message:{kind:"status"|"alert";text:string}|null)=>void};

/** @param options - Current own immutable scope, usage and route-owned actions. @returns Controlled fields and safe original results, without persistence, automatic sending or delivery-as-proof. */
export function useMessagingDiagnosticController(options:DiagnosticControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}`;
  const initial=()=>({scopeKey,draft:{channel:MESSAGING_PUBLIC_CHANNEL.email,recipient:"",country:""} as MessagingDiagnosticDraft,confirmed:false,verificationCode:"",diagnostic:null as Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>|null,delivery:null as z.infer<typeof messageDeliverySchema>|null});
  const[state,setState]=useState(initial);if(state.scopeKey!==scopeKey)setState(initial());const current=state.scopeKey===scopeKey?state:initial();
  const[nowMs,setNowMs]=useState(()=>Date.parse(options.renderedAt));
  useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),MILLISECONDS_PER_SECOND);return()=>window.clearInterval(timer);},[]);
  const update=(patch:Partial<typeof state>)=>setState((previous)=>previous.scopeKey===scopeKey?{...previous,...patch}:previous);
  const allowedCountries=options.usage.policy?.allowedCountries??[],validation=validateMessagingDiagnosticDraft(current.draft,allowedCountries),codeMessage=validateMessagingDiagnosticCode(current.verificationCode),credentialValid=options.candidate?.credentialState===MESSAGING_CREDENTIAL_PUBLIC_STATE.valid;
  const change=(draft:MessagingDiagnosticDraft)=>{if(options.blocked)return;update({draft,confirmed:false});options.feedback(null);};
  const expiresInSeconds=current.diagnostic?Math.max(0,Math.ceil((Date.parse(current.diagnostic.expiresAt)-nowMs)/MILLISECONDS_PER_SECOND)):null,resendInSeconds=current.diagnostic?Math.max(0,Math.ceil((Date.parse(current.diagnostic.resendAllowedAt)-nowMs)/MILLISECONDS_PER_SECOND)):null;
  /** SMS and WhatsApp share one phone/contact namespace; replacing it stays an explicit consented resend. */
  const canReplaceChannel=Boolean(current.diagnostic)&&(current.diagnostic?.channel===current.draft.channel||current.diagnostic?.channel!==MESSAGING_PUBLIC_CHANNEL.email&&current.draft.channel!==MESSAGING_PUBLIC_CHANNEL.email);
  const issue=async(resend=false)=>{if(options.blocked||!credentialValid||!current.confirmed||!validation.valid)return;const previous=resend?current.diagnostic:null;if(resend&&(!previous||!canReplaceChannel||resendInSeconds!==0))return;update({confirmed:false,verificationCode:""});await options.issue(validation.destination,previous?.challengeId);};
  const verify=async()=>{if(options.blocked||!current.diagnostic||codeMessage||expiresInSeconds===0)return;const code=current.verificationCode;update({verificationCode:"",confirmed:false});await options.verify(current.diagnostic,code);};
  return{...current,allowedCountries,expiresInSeconds,resendInSeconds,fieldErrors:{...validation.fieldErrors,...(current.verificationCode&&codeMessage?{verificationCode:codeMessage}:{})},canIssue:!options.blocked&&credentialValid&&current.confirmed&&validation.valid,canResend:!options.blocked&&credentialValid&&current.confirmed&&validation.valid&&canReplaceChannel&&resendInSeconds===0,canVerify:!options.blocked&&Boolean(current.diagnostic)&&!codeMessage&&expiresInSeconds!==0,
    change,confirm:(confirmed:boolean)=>{if(options.blocked)return;update({confirmed});options.feedback(null);},code:(verificationCode:string)=>{if(options.blocked)return;update({verificationCode});options.feedback(null);},clearPrivate:()=>update({draft:{...current.draft,recipient:""},verificationCode:"",confirmed:false}),
    issue:()=>issue(),resend:()=>issue(true),verify,readDelivery:async()=>{if(!options.blocked&&current.diagnostic)await options.readDelivery(current.diagnostic);},
    acceptIssuance:(result:ConnectionDiagnosticIssueResult)=>{if(result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued&&result.connectionId===options.candidate?.id&&result.connectionVersion===options.candidate.configurationVersion)update({diagnostic:result,draft:{...current.draft,channel:result.channel,recipient:""},confirmed:false,verificationCode:"",delivery:null});},
    acceptVerification:(result:ConnectionDiagnosticSnapshot)=>{update({verificationCode:"",confirmed:false});if(result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified)options.feedback({kind:"status",text:MESSAGING_DIAGNOSTIC_UI_COPY.verified});},
    acceptDelivery:(delivery:z.infer<typeof messageDeliverySchema>)=>update({delivery}),
  };
}
