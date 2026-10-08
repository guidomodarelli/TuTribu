"use client";
/** Stores only a guarded operation reference under its current viewer/route, with no key or form payload. @module messaging-connections-intent-store */
import {z} from "zod";
import type {MessagingConnectionsIntentStore} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX,MESSAGING_CONNECTION_HISTORY_LIMIT,MESSAGING_CONNECTION_HISTORY_STORAGE_SUFFIX,MESSAGING_DIAGNOSTIC_OBSERVATION_STORAGE_SUFFIX} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import {MESSAGING_CONNECTION_SECURITY_REASON} from "@/src/modules/messaging/constants/messaging-connection-security";

/** Browser metadata is untrusted input and never an authorization token. */
const resourceOriginal=z.strictObject({connectionId:z.uuid(),configurationVersion:z.int().positive(),expectedVersion:z.int().positive()});
const configurationOriginal=resourceOriginal.extend({channel:z.enum(MESSAGING_PUBLIC_CHANNEL),senderId:z.string().trim().min(1),templateId:z.string().trim().min(1).optional(),templateLanguage:z.string().trim().min(1).optional()}).refine((original)=>original.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp?Boolean(original.templateId&&original.templateLanguage):original.templateId===undefined&&original.templateLanguage===undefined);
const intentSchema=z.discriminatedUnion("type",[
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.saveMessagingCredentials),operationId:z.uuid(),original:z.strictObject({name:z.string().trim().min(1).max(ADMISSION_LIMIT.displayNameCharacters)}).optional()}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.validateMessagingConnection),operationId:z.uuid(),original:resourceOriginal.optional()}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.configureMessagingConnection),operationId:z.uuid(),original:configurationOriginal.optional()}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.activateMessagingConnection),operationId:z.uuid(),original:resourceOriginal}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.suspendMessagingConnection),operationId:z.uuid(),original:z.strictObject({connectionId:z.uuid(),expectedVersion:z.int().positive(),reason:z.enum(MESSAGING_CONNECTION_SECURITY_REASON)})}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.disconnectMessagingConnection),operationId:z.uuid(),original:z.strictObject({connectionId:z.uuid(),expectedVersion:z.int().positive()})}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.diagnoseMessagingConnection),operationId:z.uuid(),original:resourceOriginal.extend({channel:z.enum(MESSAGING_PUBLIC_CHANNEL)})}),
  z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.verifyMessagingDiagnostic),operationId:z.uuid(),original:z.strictObject({connectionId:z.uuid(),configurationVersion:z.int().positive(),diagnosticId:z.uuid(),channel:z.enum(MESSAGING_PUBLIC_CHANNEL)})}),
]);
const historySchema=z.array(intentSchema).max(MESSAGING_CONNECTION_HISTORY_LIMIT);
const diagnosticReferenceSchema=z.strictObject({operationId:z.uuid(),connectionId:z.uuid(),configurationVersion:z.int().positive(),channel:z.enum(MESSAGING_PUBLIC_CHANNEL)});
/** Legacy single references remain recoverable; the bounded list never accepts destination/code fields. */
const diagnosticHistorySchema=z.union([diagnosticReferenceSchema,z.array(diagnosticReferenceSchema).max(MESSAGING_CONNECTION_HISTORY_LIMIT)]).transform((references)=>Array.isArray(references)?references:[references]);
/** @returns An owned session-only metadata store; construction never reads browser state during SSR. */
export function createMessagingConnectionsIntentStore():MessagingConnectionsIntentStore{
  const key=(viewerId:string,slug:string)=>`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
  /** @param viewerId - Current own viewer. @param slug - Current route. @returns Exact validated issued references or absence, without clearing an original on read failure. */
  const diagnostics=(viewerId:string,slug:string)=>{if(typeof window==="undefined")return[];const value=window.sessionStorage.getItem(`${key(viewerId,slug)}${MESSAGING_DIAGNOSTIC_OBSERVATION_STORAGE_SUFFIX}`);return value?diagnosticHistorySchema.parse(JSON.parse(value)):[];};
  return{
    read(viewerId,slug){if(typeof window==="undefined")return null;const ownedKey=key(viewerId,slug);let value:string|null;try{value=window.sessionStorage.getItem(ownedKey);}catch{throw new Error("MessagingConnectionsIntentStore.read failed: storage_unavailable");}if(!value)return null;let parsed;try{parsed=intentSchema.safeParse(JSON.parse(value));}catch{parsed=null;}if(parsed?.success)return parsed.data;try{window.sessionStorage.removeItem(ownedKey);}catch{throw new Error("MessagingConnectionsIntentStore.read failed: corrupt_reference_cleanup_unavailable");}return null;},
    write(viewerId,slug,intent){if(typeof window==="undefined")return false;try{if(intent===null)window.sessionStorage.removeItem(key(viewerId,slug));else window.sessionStorage.setItem(key(viewerId,slug),JSON.stringify(intentSchema.parse(intent)));return true;}catch{return false;}},
    history(viewerId,slug){if(typeof window==="undefined")return[];const value=window.sessionStorage.getItem(`${key(viewerId,slug)}${MESSAGING_CONNECTION_HISTORY_STORAGE_SUFFIX}`);if(!value)return[];return historySchema.parse(JSON.parse(value));},
    archive(viewerId,slug,intent){if(typeof window==="undefined")return false;try{const historyKey=`${key(viewerId,slug)}${MESSAGING_CONNECTION_HISTORY_STORAGE_SUFFIX}`,value=window.sessionStorage.getItem(historyKey),previous=value?historySchema.parse(JSON.parse(value)):[],original=intentSchema.parse(intent);if(previous.some((entry)=>entry.operationId===original.operationId&&entry.type===original.type))return true;if(previous.length>=MESSAGING_CONNECTION_HISTORY_LIMIT)return false;window.sessionStorage.setItem(historyKey,JSON.stringify([...previous,original]));return true;}catch{return false;}},
    diagnostic(viewerId,slug){return diagnostics(viewerId,slug).at(-1)??null;},
    diagnostics,
    writeDiagnostic(viewerId,slug,reference){if(typeof window==="undefined")return false;try{const ownedKey=`${key(viewerId,slug)}${MESSAGING_DIAGNOSTIC_OBSERVATION_STORAGE_SUFFIX}`;if(reference===null)window.sessionStorage.removeItem(ownedKey);else{const original=diagnosticReferenceSchema.parse(reference),previous=diagnostics(viewerId,slug),matching=previous.find((entry)=>entry.operationId===original.operationId);if(matching&&(matching.connectionId!==original.connectionId||matching.configurationVersion!==original.configurationVersion||matching.channel!==original.channel))return false;const preserved=previous.filter((entry)=>entry.operationId!==original.operationId);if(preserved.length>=MESSAGING_CONNECTION_HISTORY_LIMIT)return false;window.sessionStorage.setItem(ownedKey,JSON.stringify([...preserved,original]));}return true;}catch{return false;}},
  };
}
/** No browser storage is touched before a container requests it after hydration. */
export const messagingConnectionsIntentStore=createMessagingConnectionsIntentStore();
