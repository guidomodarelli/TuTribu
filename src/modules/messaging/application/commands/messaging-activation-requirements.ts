/** Projects visible activation prerequisites from own metadata without granting secret access or reproducing server dependency authority. @module messaging-activation-requirements */
import type {MessagingConfigurationConnection} from "../results/messaging-configuration-result";
import type {MessagingUsagePolicyStateDto} from "../results/messaging-public-result-schemas";
import {MESSAGING_ACTIVATION_UI_COPY} from "../../constants/messaging-activation-browser";
import {MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS} from "../../constants/messaging-connection-lifecycle";
import {MESSAGING_CONNECTION_STATE} from "../../constants/messaging-connection";
import {MESSAGING_CAPABILITY_PUBLIC_STATE,MESSAGING_CREDENTIAL_PUBLIC_STATE,MESSAGING_PUBLIC_CHANNEL} from "../../constants/messaging-public-contract";
import {MESSAGING_CREDENTIAL_MODE} from "../../constants/messaging-credential-validation";

/** @param candidate - Own currently projected candidate metadata. @param usage - The same saved usage owner used by diagnostics. @param renderedAt - Supplied deterministic render/observation time. @returns Visible missing steps; the server still checks exact required channels, ownership and local evidence at commit. */
export function assessMessagingActivationRequirements(candidate:MessagingConfigurationConnection,usage:MessagingUsagePolicyStateDto,renderedAt:string):{eligible:boolean;messages:string[]}{
  const messages:string[]=[],nowMs=Date.parse(renderedAt);
  if(candidate.state===MESSAGING_CONNECTION_STATE.suspended||candidate.state===MESSAGING_CONNECTION_STATE.disconnected)messages.push(MESSAGING_ACTIVATION_UI_COPY.suspended);
  if(candidate.credentialState!==MESSAGING_CREDENTIAL_PUBLIC_STATE.valid)messages.push(MESSAGING_ACTIVATION_UI_COPY.credentialRequired);
  else if(candidate.credentialMode!==MESSAGING_CREDENTIAL_MODE.production)messages.push(MESSAGING_ACTIVATION_UI_COPY.productionRequired);
  if(candidate.capabilities.length===0)messages.push(MESSAGING_ACTIVATION_UI_COPY.channelRequired);
  else if(candidate.capabilities.some((capability)=>{const age=capability.testedAt?nowMs-Date.parse(capability.testedAt):Number.NaN;return capability.state!==MESSAGING_CAPABILITY_PUBLIC_STATE.prepared||!Number.isFinite(age)||age<0||age>MESSAGING_CONNECTION_DIAGNOSTIC_MAXIMUM_AGE_MS;}))messages.push(MESSAGING_ACTIVATION_UI_COPY.testRequired);
  if(candidate.capabilities.some((capability)=>capability.channel!==MESSAGING_PUBLIC_CHANNEL.email)&&!(usage.policy?.allowedCountries.length))messages.push(MESSAGING_ACTIVATION_UI_COPY.countriesRequired);
  return{eligible:messages.length===0,messages};
}
