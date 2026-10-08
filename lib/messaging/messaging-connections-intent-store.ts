"use client";
/** Stores only a guarded operation reference under its current viewer/route, with no key or form payload. @module messaging-connections-intent-store */
import {z} from "zod";
import type {MessagingConnectionsIntentStore} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";

/** Browser metadata is untrusted input and never an authorization token. */
const intentSchema=z.strictObject({type:z.literal(REAUTHENTICATION_OPERATION.saveMessagingCredentials),operationId:z.uuid()});
/** @returns An owned session-only metadata store; construction never reads browser state during SSR. */
export function createMessagingConnectionsIntentStore():MessagingConnectionsIntentStore{
  const key=(viewerId:string,slug:string)=>`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
  return{
    read(viewerId,slug){if(typeof window==="undefined")return null;const ownedKey=key(viewerId,slug);let value:string|null;try{value=window.sessionStorage.getItem(ownedKey);}catch{throw new Error("MessagingConnectionsIntentStore.read failed: storage_unavailable");}if(!value)return null;let parsed;try{parsed=intentSchema.safeParse(JSON.parse(value));}catch{parsed=null;}if(parsed?.success)return parsed.data;try{window.sessionStorage.removeItem(ownedKey);}catch{throw new Error("MessagingConnectionsIntentStore.read failed: corrupt_reference_cleanup_unavailable");}return null;},
    write(viewerId,slug,intent){if(typeof window==="undefined")return false;try{if(intent===null)window.sessionStorage.removeItem(key(viewerId,slug));else window.sessionStorage.setItem(key(viewerId,slug),JSON.stringify(intentSchema.parse(intent)));return true;}catch{return false;}},
  };
}
/** No browser storage is touched before a container requests it after hydration. */
export const messagingConnectionsIntentStore=createMessagingConnectionsIntentStore();
