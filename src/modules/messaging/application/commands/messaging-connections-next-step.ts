/** Projects the advisory next workspace step from own connection metadata without granting authority or reading providers. @module messaging-connections-next-step */
import type {MessagingConfigurationConnection} from "../results/messaging-configuration-result";
import {MESSAGING_CAPABILITY_PUBLIC_STATE,MESSAGING_CREDENTIAL_PUBLIC_STATE} from "../../constants/messaging-public-contract";
import {MESSAGING_CONNECTIONS_NEXT_STEP,type MessagingConnectionsNextStep} from "../../constants/messaging-connections-workspace";

/**
 * @param connections - The leader's current selected connection and candidate, as projected by the server.
 * @returns The first unfinished step for the candidate; activation requirements are still checked by the server.
 */
export function resolveMessagingConnectionsNextStep(connections:{selected:MessagingConfigurationConnection|null;candidate:MessagingConfigurationConnection|null}):MessagingConnectionsNextStep{
  const{candidate,selected}=connections;
  if(!candidate)return MESSAGING_CONNECTIONS_NEXT_STEP.saveCandidate;
  if(candidate.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid)return MESSAGING_CONNECTIONS_NEXT_STEP.validateCredential;
  // At least one usable channel moves the candidate on, as the copy says; an unavailable extra channel does not hold the others back.
  if(candidate.capabilities.every((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.unavailable))return MESSAGING_CONNECTIONS_NEXT_STEP.prepareChannel;
  if(candidate.capabilities.some((capability)=>capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.unprepared))return MESSAGING_CONNECTIONS_NEXT_STEP.testChannel;
  return selected?.id===candidate.id&&selected.configurationVersion===candidate.configurationVersion?MESSAGING_CONNECTIONS_NEXT_STEP.active:MESSAGING_CONNECTIONS_NEXT_STEP.activate;
}
