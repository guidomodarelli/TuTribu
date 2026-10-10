/** Prepares explicit diagnostic fields without issuing a code, consuming quota or granting resource authority. @module messaging-diagnostic-draft */
import type {MessagingDiagnosticBrowserIssue} from "../ports/messaging-diagnostic-browser-client";
import {normalizeAdmissionContact} from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import {ADMISSION_CONTACT_TYPE,ADMISSION_CONTACT_NORMALIZATION_STATUS} from "@/src/modules/academy-admissions/constants/admission-contact";
import {ADMISSION_PUBLIC_CODE_PATTERN} from "@/src/modules/academy-admissions/constants/admission-public-contract";
import {MESSAGING_PUBLIC_CHANNEL} from "../../constants/messaging-public-contract";
import {MESSAGING_DIAGNOSTIC_UI_COPY} from "../../constants/messaging-diagnostic-browser";

/** Destination/code live only in the route's controlled memory. */
export type MessagingDiagnosticDraft={channel:MessagingDiagnosticBrowserIssue["channel"];recipient:string;country:string};
export type MessagingDiagnosticFieldErrors=Partial<Record<"recipient"|"country"|"verificationCode",string>>;
/** Only the capability's relevant normalized destination crosses the explicit browser command. */
export type MessagingDiagnosticDestination=Pick<MessagingDiagnosticBrowserIssue,"channel"|"recipient"|"country">;

/** @param draft - Controlled untrusted destination proposal. @param allowedCountries - Saved own usage policy, never another country editor. @returns Normalized relevant fields or pre-action feedback without sending or persisting contact information. */
export function validateMessagingDiagnosticDraft(draft:MessagingDiagnosticDraft,allowedCountries:readonly string[]):{valid:true;destination:MessagingDiagnosticDestination;fieldErrors:MessagingDiagnosticFieldErrors}|{valid:false;fieldErrors:MessagingDiagnosticFieldErrors}{
  const fieldErrors:MessagingDiagnosticFieldErrors={},phone=draft.channel!==MESSAGING_PUBLIC_CHANNEL.email,country=draft.country.trim().toUpperCase();
  if(!draft.recipient.trim())fieldErrors.recipient=MESSAGING_DIAGNOSTIC_UI_COPY.destinationRequired;
  if(phone&&(!country||!allowedCountries.includes(country)))fieldErrors.country=MESSAGING_DIAGNOSTIC_UI_COPY.countryRequired;
  if(Object.keys(fieldErrors).length)return{valid:false,fieldErrors};
  const normalized=normalizeAdmissionContact({type:phone?ADMISSION_CONTACT_TYPE.phone:ADMISSION_CONTACT_TYPE.email,value:draft.recipient,...(phone?{country}:{})});
  if(normalized.status!==ADMISSION_CONTACT_NORMALIZATION_STATUS.valid)return{valid:false,fieldErrors:{recipient:MESSAGING_DIAGNOSTIC_UI_COPY.destinationInvalid}};
  return{valid:true,fieldErrors,destination:{channel:draft.channel,recipient:normalized.contact.value,...(normalized.contact.type===ADMISSION_CONTACT_TYPE.phone?{country:normalized.contact.country}:{})}};
}

/** @param code - Explicit code received by the operator, held only in memory. @returns Safe feedback or null for the actual shared code shape; possession remains server-verified. */
export function validateMessagingDiagnosticCode(code:string):string|null{return ADMISSION_PUBLIC_CODE_PATTERN.test(code)?null:MESSAGING_DIAGNOSTIC_UI_COPY.codeRequired;}
