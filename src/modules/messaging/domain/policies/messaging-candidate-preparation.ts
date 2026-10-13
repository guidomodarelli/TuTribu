/** Assesses local channel preparation without selecting the candidate or inferring credential production mode. @module messaging-candidate-preparation */
import type {MessagingConnectionConfiguration,MessagingConnectionCapability} from "../entities/messaging-connection-version";
import {MESSAGING_PUBLIC_CHANNEL,MESSAGING_CAPABILITY_PUBLIC_STATE} from "../../constants/messaging-public-contract";

/** Exact immutable resource and confirmed local capability facts supplied by the owning writer. */
export type MessagingCandidatePreparationFacts={configuration:MessagingConnectionConfiguration;credentialValidated:boolean;capabilities:readonly (MessagingConnectionCapability&{testedAt:Date|null})[]};

/** @param facts - Current exact configuration and confirmed capability metadata. @returns Whether all configured channels are prepared; it grants no session, production or selection authority. */
export function assessMessagingCandidatePreparation(facts:MessagingCandidatePreparationFacts):{prepared:boolean}{
  if(!facts.credentialValidated)return{prepared:false};
  const configured=[{channel:MESSAGING_PUBLIC_CHANNEL.email,senderId:facts.configuration.emailSenderId},{channel:MESSAGING_PUBLIC_CHANNEL.sms,senderId:facts.configuration.smsSenderId},{channel:MESSAGING_PUBLIC_CHANNEL.whatsapp,senderId:facts.configuration.whatsappSenderId}].filter((resource)=>Boolean(resource.senderId));
  if(configured.length===0)return{prepared:false};
  const prepared=configured.every((resource)=>facts.capabilities.some((capability)=>capability.channel===resource.channel&&capability.senderId===resource.senderId&&capability.state===MESSAGING_CAPABILITY_PUBLIC_STATE.prepared&&capability.testedAt!==null&&Number.isFinite(capability.testedAt.getTime())&&(resource.channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp||Boolean(facts.configuration.whatsappTemplateId&&facts.configuration.whatsappTemplateLanguage)&&capability.templateId===facts.configuration.whatsappTemplateId&&capability.templateLanguage===facts.configuration.whatsappTemplateLanguage)));
  return{prepared};
}
