"use client";
/** Owns only local lifecycle selection and version/cause-scoped confirmation; the container owns transport and authority. @module messaging-lifecycle-controller */
import { useMemo, useState } from "react";
import type { MessagingConfigurationResult } from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type { MessagingLifecycleConnectionView } from "@/components/academy-admissions/messaging-connection-lifecycle";
import type { MessagingConnectionSuspensionInput } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "@/src/modules/messaging/constants/messaging-connection-security";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";

/** @param dependencies - Current own snapshot, blocking state, the connection the page opened Security for and explicit action callback. @returns Controlled view props and renewed consent keyed to exact connection/lifecycle/action/cause. */
export function useMessagingLifecycleController(dependencies:{configuration:MessagingConfigurationResult|null;blocked:boolean;initialTarget?:{id:string;retire:boolean}|null;act:(connection:MessagingLifecycleConnectionView,retiring:boolean,reason:MessagingConnectionSuspensionInput["reason"])=>Promise<void>}){
  const[selectedId,setSelectedId]=useState(dependencies.initialTarget?.id??""),[retiring,setRetiring]=useState(dependencies.initialTarget?.retire??false),[reason,setReason]=useState<MessagingConnectionSuspensionInput["reason"]>(MESSAGING_CONNECTION_SECURITY_REASON.securityStop),[consentedScope,setConsentedScope]=useState("");
  const connections=useMemo(()=>{
    if(dependencies.configuration?.audience!==TRIBE_MEMBER_ROLE.leader)return[];
    const current=new Map<string,MessagingLifecycleConnectionView>();
    for(const[connection,selected]of[[dependencies.configuration.selected,true],[dependencies.configuration.candidate,false]]as const){if(!connection)continue;const previous=current.get(connection.id);current.set(connection.id,{id:connection.id,name:connection.name,version:connection.version,state:connection.state,selected:selected||previous?.selected===true,candidate:!selected||previous?.candidate===true});}
    return[...current.values()];
  },[dependencies.configuration]);
  const target=connections.find((connection)=>connection.id===selectedId)??connections.at(0),scope=target?JSON.stringify([target.id,target.version,retiring,retiring?null:reason]):"",confirmed=Boolean(scope&&consentedScope===scope),canAct=Boolean(!dependencies.blocked&&target&&target.state!==MESSAGING_CONNECTION_STATE.disconnected);
  return{connections,targetId:target?.id??"",target,retiring,reason,confirmed,canAct,
    /** @returns Nothing after retiring all current local consent. */
    reset:()=>setConsentedScope(""),
    /** @param id - Current own resource selection. @returns Nothing after clearing consent for the prior target. */
    targetChanged:(id:string)=>{setSelectedId(id);setConsentedScope("");},
    /** @param id - Connection the leader arrived to manage, such as the candidate named by the next action. @param retire - Whether retirement is the action that resolves it. @returns Nothing after preselecting both without consent; the leader still confirms. */
    preselect:(id:string,retire:boolean)=>{setSelectedId(id);setRetiring(retire);setConsentedScope("");},
    /** @param value - Explicit ordinary retirement choice. @returns Nothing after clearing prior action consent. */
    retiringChanged:(value:boolean)=>{setRetiring(value);setConsentedScope("");},
    /** @param value - Explicit safe suspension cause. @returns Nothing after clearing prior cause consent. */
    reasonChanged:(value:MessagingConnectionSuspensionInput["reason"])=>{setReason(value);setConsentedScope("");},
    /** @param value - User confirmation for the current exact view scope. @returns Nothing after retaining only its scope, without authority claims. */
    confirm:(value:boolean)=>setConsentedScope(value?scope:""),
    /** @returns After one explicit renewed action through the container, never an automatic request. */
    act:async()=>{if(!target||!canAct||!confirmed)return;setConsentedScope("");await dependencies.act(target,retiring,reason);},
  };
}
