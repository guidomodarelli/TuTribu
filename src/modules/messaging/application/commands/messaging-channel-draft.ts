/** Normalizes controlled resource proposals before explicit configuration, independently of provider DTOs or authority. @module messaging-channel-draft */
import {MESSAGING_PUBLIC_CHANNEL} from "../../constants/messaging-public-contract";
import {MESSAGING_RESOURCE_UI_COPY} from "../../constants/messaging-resources-browser";
import type {MessagingConnectionConfigurationInput} from "../../domain/repositories/messaging-connection-configuration";

/** Temporary form state is never persisted as a credential or interpreted as effective configuration. */
export type MessagingChannelDraft={channel:MessagingConnectionConfigurationInput["channel"];senderId:string;templateId:string;templateLanguage:string};
/** Specific field feedback remains independent from session, CAS, permission and provider failures. */
export type MessagingChannelFieldErrors=Partial<Record<"senderId"|"templateId"|"templateLanguage",string>>;
/** Only selected capability fields may reach the explicit immutable write. */
export type MessagingChannelReferences=Pick<MessagingConnectionConfigurationInput,"channel"|"senderId"|"templateId"|"templateLanguage">;

/** @param draft - Controlled untrusted field values. @returns Trimmed relevant references or actionable field feedback; this grants no resource or send permission. */
export function validateMessagingChannelDraft(draft:MessagingChannelDraft):{valid:true;references:MessagingChannelReferences;fieldErrors:MessagingChannelFieldErrors}|{valid:false;fieldErrors:MessagingChannelFieldErrors}{
  const fieldErrors:MessagingChannelFieldErrors={},senderId=draft.senderId.trim(),templateId=draft.templateId.trim(),templateLanguage=draft.templateLanguage.trim();
  if(!senderId)fieldErrors.senderId=MESSAGING_RESOURCE_UI_COPY.senderRequired;
  const whatsapp=draft.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp;
  if(whatsapp&&!templateId)fieldErrors.templateId=MESSAGING_RESOURCE_UI_COPY.templateRequired;
  if(whatsapp&&!templateLanguage)fieldErrors.templateLanguage=MESSAGING_RESOURCE_UI_COPY.languageRequired;
  if(Object.keys(fieldErrors).length)return{valid:false,fieldErrors};
  return{valid:true,fieldErrors,references:{channel:draft.channel,senderId,...(whatsapp?{templateId,templateLanguage}:{})}};
}
