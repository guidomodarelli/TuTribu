"use client";
/** Remembers only the workspace tab in session storage, scoped by viewer and route, for the return from Google. @module messaging-connections-tab-store */
import type {MessagingConnectionsTabStore} from "@/src/modules/messaging/application/ports/messaging-connections-tab-store";
import {MESSAGING_CONNECTIONS_TAB_ORDER,MESSAGING_CONNECTIONS_TAB_STORAGE_PREFIX,type MessagingConnectionsTab} from "@/src/modules/messaging/constants/messaging-connections-workspace";

/** @param value - Untrusted stored text. @returns The matching known tab, never an arbitrary string. */
const parseTab=(value:string|null):MessagingConnectionsTab|null=>MESSAGING_CONNECTIONS_TAB_ORDER.find((tab)=>tab===value)??null;

/** @returns A session-only tab store; construction never reads browser state during SSR. */
export function createMessagingConnectionsTabStore():MessagingConnectionsTabStore{
  const key=(viewerId:string,slug:string)=>`${MESSAGING_CONNECTIONS_TAB_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
  return{
    take(viewerId,slug){if(typeof window==="undefined")return null;try{const ownedKey=key(viewerId,slug),tab=parseTab(window.sessionStorage.getItem(ownedKey));window.sessionStorage.removeItem(ownedKey);return tab;}catch{return null;}},
    remember(viewerId,slug,tab){if(typeof window==="undefined")return false;try{window.sessionStorage.setItem(key(viewerId,slug),tab);return true;}catch{return false;}},
  };
}
/** No browser storage is touched before the container requests it after hydration. */
export const messagingConnectionsTabStore=createMessagingConnectionsTabStore();
