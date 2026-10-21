/** Projects the linear connection flow (one small step per decision) and why each step cannot be left yet, from own metadata. @module messaging-connections-flow */
import type {MessagingConfigurationConnection} from "../results/messaging-configuration-result";
import {MESSAGING_CAPABILITY_PUBLIC_STATE,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "../../constants/messaging-public-contract";
import {MESSAGING_CHANNEL_LABEL} from "../../constants/messaging-connection-presentation";
import {MESSAGING_CONNECTIONS_FLOW_COPY as FLOW_COPY,MESSAGING_CONNECTIONS_STEP_COPY as STEP_COPY,MESSAGING_CONNECTIONS_NEXT_STEP,MESSAGING_CONNECTIONS_STEP_KIND as STEP_KIND,type MessagingConnectionsStepKind} from "../../constants/messaging-connections-workspace";
import {isExactActiveSelection,isMessagingCapabilityFreshlyTested,type MessagingConnectionChannel,type MessagingConnectionsNextAction} from "./messaging-connections-next-action";

/** One step of the flow; `blockedReason` keeps Siguiente disabled until the step's own write has finished. */
export type MessagingConnectionsFlowStep={id:string;kind:MessagingConnectionsStepKind;channel:MessagingConnectionChannel|null;title:string;description:string;blockedReason:string|null};

/** @param kind - Step kind. @param channel - Channel of a test step. @returns The stable id of that step, unique within the flow. */
export const messagingConnectionsStepId=(kind:MessagingConnectionsStepKind,channel:MessagingConnectionChannel|null=null)=>channel?`${kind}:${channel}`:kind;

/**
 * Builds the steps in the order the server requires: key, credential, channels, one test per usable configured channel, activation.
 * @param input - Current selection and candidate, and the observation time used to tell a test that expired; the unchanged active selection is not retested daily.
 * @returns Every step with its blocked reason; activation is last and its own action checks the requirements.
 */
export function resolveMessagingConnectionsFlow(input:{selected?:MessagingConfigurationConnection|null;candidate:MessagingConfigurationConnection|null;observedAt:string}):MessagingConnectionsFlowStep[]{
  const{candidate}=input,nowMs=Date.parse(input.observedAt),activeSelection=isExactActiveSelection(input.selected??null,candidate);
  const usable=candidate?.capabilities.filter((capability)=>capability.state!==MESSAGING_CAPABILITY_PUBLIC_STATE.unavailable)??[];
  const credentialBlocked=!candidate?FLOW_COPY.keyRequired:candidate.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid?FLOW_COPY.credentialRequired:null;
  return[
    {id:messagingConnectionsStepId(STEP_KIND.key),kind:STEP_KIND.key,channel:null,...STEP_COPY.key,blockedReason:candidate?null:FLOW_COPY.keyRequired},
    {id:messagingConnectionsStepId(STEP_KIND.credential),kind:STEP_KIND.credential,channel:null,...STEP_COPY.credential,blockedReason:credentialBlocked},
    {id:messagingConnectionsStepId(STEP_KIND.channels),kind:STEP_KIND.channels,channel:null,...STEP_COPY.channels,blockedReason:credentialBlocked??(usable.length?null:FLOW_COPY.channelRequired)},
    ...usable.map((capability)=>{const label=MESSAGING_CHANNEL_LABEL[capability.channel];return{id:messagingConnectionsStepId(STEP_KIND.test,capability.channel),kind:STEP_KIND.test,channel:capability.channel,...STEP_COPY.test(label),blockedReason:isMessagingCapabilityFreshlyTested(capability,nowMs)||activeSelection&&capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared?null:FLOW_COPY.testRequired(label)};}),
    {id:messagingConnectionsStepId(STEP_KIND.activation),kind:STEP_KIND.activation,channel:null,...STEP_COPY.activation,blockedReason:null},
  ];
}

/** @param action - The resolved next action. @returns The id of the flow step that resolves it, or null when it is resolved outside the flow (security, usage page). */
export function messagingConnectionsActionStepId(action:MessagingConnectionsNextAction):string|null{
  if(action.target?.kind!=="step")return action.step===MESSAGING_CONNECTIONS_NEXT_STEP.active?messagingConnectionsStepId(STEP_KIND.activation):null;
  return messagingConnectionsStepId(action.target.step,action.target.step===STEP_KIND.test?action.channel:null);
}
