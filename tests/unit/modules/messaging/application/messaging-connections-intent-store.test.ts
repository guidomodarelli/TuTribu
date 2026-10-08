/** Exercises actual session storage metadata boundaries without source-text checks or platform mocks. @module messaging-connections-intent-store-tests */
import {randomUUID} from "node:crypto";
import {beforeEach,describe,expect,it} from "vitest";
import {createMessagingConnectionsIntentStore} from "@/lib/messaging/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX} from "@/src/modules/messaging/constants/messaging-connections-browser";

describe("connection intent metadata storage",()=>{
  beforeEach(()=>window.sessionStorage.clear());
  it("should store only the original reference under exact viewer and tribe and clear only that scope",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),operationId=randomUUID(),intent={type:"save_messaging_credentials" as const,operationId};expect(store.write(viewerId,"synthetic",intent)).toBe(true);expect(store.read(viewerId,"synthetic")).toEqual(intent);expect(store.read(randomUUID(),"synthetic")).toBeNull();expect(store.read(viewerId,"other")).toBeNull();expect(store.write(viewerId,"other",{...intent,operationId:randomUUID()})).toBe(true);expect(store.write(viewerId,"synthetic",null)).toBe(true);expect(store.read(viewerId,"synthetic")).toBeNull();expect(store.read(viewerId,"other")).not.toBeNull();
  });
  it("should reject corrupted or credential-bearing browser metadata and remove the unusable owned entry",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),key=`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${viewerId}:synthetic`;
    window.sessionStorage.setItem(key,JSON.stringify({type:"save_messaging_credentials",operationId:randomUUID(),apiKey:randomUUID()}));expect(store.read(viewerId,"synthetic")).toBeNull();expect(window.sessionStorage.getItem(key)).toBeNull();
    window.sessionStorage.setItem(key,"{broken");expect(store.read(viewerId,"synthetic")).toBeNull();expect(window.sessionStorage.getItem(key)).toBeNull();
  });
});
