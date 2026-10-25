"use client";
/** Scopes renewed activation consent to the observed candidate while the route retains requests and authority. @module messaging-activation-controller */
import {useEffect,useState} from "react";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {assessMessagingActivationRequirements,nextMessagingActivationFreshnessChange} from "@/src/modules/messaging/application/commands/messaging-activation-requirements";
import {TIMER_MAXIMUM_DELAY_MS} from "@/src/constants/time";

/** Supplied SSR time keeps the first render deterministic; the clock only moves when a channel test's freshness can change. */
type ActivationControllerOptions={candidate:MessagingConfigurationConnection|null;usage:MessagingUsagePolicyStateDto;renderedAt:string;blocked:boolean;activate:()=>Promise<void>;feedback:()=>void};
/** @param options - Own current snapshot and route-owned explicit action. @returns Version-scoped consent and advisory prerequisites; no request occurs on render or clock updates. */
export function useMessagingActivationController(options:ActivationControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}:${options.candidate?.version??0}`;
  const[state,setState]=useState(()=>({scopeKey,confirmed:false}));if(state.scopeKey!==scopeKey)setState({scopeKey,confirmed:false});
  const[nowMs,setNowMs]=useState(()=>Date.parse(options.renderedAt));
  // Eligibility only changes when a test enters or leaves its window, so one timeout replaces a re-render every second.
  const nextChangeMs=nextMessagingActivationFreshnessChange(options.candidate,new Date(nowMs).toISOString());
  useEffect(()=>{if(nextChangeMs===null)return;const timer=window.setTimeout(()=>setNowMs(Date.now()),Math.min(Math.max(0,nextChangeMs-Date.now()),TIMER_MAXIMUM_DELAY_MS));return()=>window.clearTimeout(timer);},[nextChangeMs]);
  const assessment=options.candidate?assessMessagingActivationRequirements(options.candidate,options.usage,new Date(nowMs).toISOString()):{eligible:false,messages:[]},confirmed=state.scopeKey===scopeKey&&state.confirmed;
  return{confirmed,requirements:assessment.messages,canActivate:!options.blocked&&confirmed&&assessment.eligible,confirm:(value:boolean)=>{if(options.blocked)return;setState({scopeKey,confirmed:value});options.feedback();},reset:()=>setState({scopeKey,confirmed:false}),activate:async()=>{if(options.blocked||!confirmed||!assessment.eligible)return;setState({scopeKey,confirmed:false});await options.activate();}};
}
