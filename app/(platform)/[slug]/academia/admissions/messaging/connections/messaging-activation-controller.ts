"use client";
/** Scopes renewed activation consent to the observed candidate while the route retains requests and authority. @module messaging-activation-controller */
import {useEffect,useState} from "react";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {assessMessagingActivationRequirements} from "@/src/modules/messaging/application/commands/messaging-activation-requirements";
import {MILLISECONDS_PER_SECOND} from "@/src/constants/time";

/** Supplied SSR time keeps the first render deterministic; the timer only updates visible eligibility hints. */
type ActivationControllerOptions={candidate:MessagingConfigurationConnection|null;usage:MessagingUsagePolicyStateDto;renderedAt:string;blocked:boolean;activate:()=>Promise<void>;feedback:()=>void};
/** @param options - Own current snapshot and route-owned explicit action. @returns Version-scoped consent and advisory prerequisites; no request occurs on render or clock updates. */
export function useMessagingActivationController(options:ActivationControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}:${options.candidate?.version??0}`;
  const[state,setState]=useState(()=>({scopeKey,confirmed:false}));if(state.scopeKey!==scopeKey)setState({scopeKey,confirmed:false});
  const[nowMs,setNowMs]=useState(()=>Date.parse(options.renderedAt));useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),MILLISECONDS_PER_SECOND);return()=>window.clearInterval(timer);},[]);
  const assessment=options.candidate?assessMessagingActivationRequirements(options.candidate,options.usage,new Date(nowMs).toISOString()):{eligible:false,messages:[]},confirmed=state.scopeKey===scopeKey&&state.confirmed;
  return{confirmed,requirements:assessment.messages,canActivate:!options.blocked&&confirmed&&assessment.eligible,confirm:(value:boolean)=>{if(options.blocked)return;setState({scopeKey,confirmed:value});options.feedback();},reset:()=>setState({scopeKey,confirmed:false}),activate:async()=>{if(options.blocked||!confirmed||!assessment.eligible)return;setState({scopeKey,confirmed:false});await options.activate();}};
}
