/** Exercises actual session storage metadata boundaries without source-text checks or platform mocks. @module messaging-connections-intent-store-tests */
import {randomUUID} from "node:crypto";
import {beforeEach,describe,expect,it} from "vitest";
import {createMessagingConnectionsIntentStore} from "@/lib/messaging/messaging-connections-intent-store";
import {MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX,MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";

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
  it("should retain the original credential-check type without storing its connection or input",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),intent={type:"validate_messaging_connection" as const,operationId:randomUUID()};expect(store.write(viewerId,"synthetic",intent)).toBe(true);expect(store.read(viewerId,"synthetic")).toEqual(intent);expect(JSON.parse(window.sessionStorage.getItem(`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${viewerId}:synthetic`)!)).toEqual(intent);
  });

  it("should preserve only replayable public original fields and reject any credential in an original payload",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),operationId=randomUUID(),intent={type:"configure_messaging_connection" as const,operationId,original:{connectionId:randomUUID(),configurationVersion:2,expectedVersion:4,channel:"whatsapp" as const,senderId:"sender-original",templateId:"template-original",templateLanguage:"es"}};
    expect(store.write(viewerId,"synthetic",intent)).toBe(true);expect(store.read(viewerId,"synthetic")).toEqual(intent);
    const key=`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${viewerId}:synthetic`;window.sessionStorage.setItem(key,JSON.stringify({type:"save_messaging_credentials",operationId,original:{name:"Original",apiKey:randomUUID()}}));expect(store.read(viewerId,"synthetic")).toBeNull();expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("should archive an original without clearing pending or losing its public fields and scope",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),intent={type:"save_messaging_credentials" as const,operationId:randomUUID(),original:{name:"Nombre original"}};expect(store.write(viewerId,"synthetic",intent)).toBe(true);expect(store.archive(viewerId,"synthetic",intent)).toBe(true);expect(store.read(viewerId,"synthetic")).toEqual(intent);expect(store.history(viewerId,"synthetic")).toEqual([intent]);expect(store.archive(viewerId,"synthetic",intent)).toBe(true);expect(store.history(viewerId,"synthetic")).toHaveLength(1);expect(store.history(randomUUID(),"synthetic")).toEqual([]);expect(store.history(viewerId,"other")).toEqual([]);
  });

  it("should refuse another archive when history is full without silently dropping an older original",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),originals=Array.from({length:MESSAGING_CONNECTION_HISTORY_LIMIT},()=>({type:"save_messaging_credentials" as const,operationId:randomUUID()}));for(const original of originals)expect(store.archive(viewerId,"synthetic",original)).toBe(true);expect(store.archive(viewerId,"synthetic",{type:"save_messaging_credentials",operationId:randomUUID()})).toBe(false);expect(store.history(viewerId,"synthetic")).toEqual(originals);
  });

  it("should retain an issued diagnostic observation without a destination, code, key or mutation permission",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),reference={operationId:randomUUID(),connectionId:randomUUID(),configurationVersion:2,channel:"email" as const};expect(store.writeDiagnostic(viewerId,"synthetic",reference)).toBe(true);expect(store.diagnostic(viewerId,"synthetic")).toEqual(reference);expect(store.diagnostic(randomUUID(),"synthetic")).toBeNull();expect(store.read(viewerId,"synthetic")).toBeNull();expect(store.writeDiagnostic(viewerId,"synthetic",null)).toBe(true);expect(store.diagnostic(viewerId,"synthetic")).toBeNull();
  });

  it("should preserve previous issued references across A to B to A selection without saving a destination or code",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),first={operationId:randomUUID(),connectionId:randomUUID(),configurationVersion:2,channel:"email" as const},second={...first,operationId:randomUUID(),channel:"sms" as const};
    expect(store.writeDiagnostic(viewerId,"synthetic",first)).toBe(true);expect(store.writeDiagnostic(viewerId,"synthetic",second)).toBe(true);expect(store.diagnostics(viewerId,"synthetic")).toEqual([first,second]);expect(store.diagnostic(viewerId,"synthetic")).toEqual(second);expect(store.writeDiagnostic(viewerId,"synthetic",first)).toBe(true);expect(store.diagnostic(viewerId,"synthetic")).toEqual(first);expect(store.diagnostics(viewerId,"synthetic")).toEqual([second,first]);expect(store.diagnostics(randomUUID(),"synthetic")).toEqual([]);expect(store.diagnostics(viewerId,"other")).toEqual([]);
  });

  it("should keep a legacy single diagnostic reference readable and refuse a full history without losing an earlier emission",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),reference={operationId:randomUUID(),connectionId:randomUUID(),configurationVersion:2,channel:"email" as const},key=`${MESSAGING_CONNECTIONS_INTENT_STORAGE_PREFIX}:${viewerId}:synthetic:diagnostic`;
    window.sessionStorage.setItem(key,JSON.stringify(reference));expect(store.diagnostics(viewerId,"synthetic")).toEqual([reference]);for(let index=1;index<MESSAGING_CONNECTION_HISTORY_LIMIT;index+=1)expect(store.writeDiagnostic(viewerId,"synthetic",{...reference,operationId:randomUUID()})).toBe(true);const originals=store.diagnostics(viewerId,"synthetic");expect(store.writeDiagnostic(viewerId,"synthetic",{...reference,operationId:randomUUID()})).toBe(false);expect(store.diagnostics(viewerId,"synthetic")).toEqual(originals);expect(originals).toContainEqual(reference);
  });
  it("should reject private diagnostic metadata without replacing the previously retained reference",()=>{
    const store=createMessagingConnectionsIntentStore(),viewerId=randomUUID(),reference={operationId:randomUUID(),connectionId:randomUUID(),configurationVersion:2,channel:"email" as const};expect(store.writeDiagnostic(viewerId,"synthetic",reference)).toBe(true);expect(store.writeDiagnostic(viewerId,"synthetic",{...reference,operationId:randomUUID(),recipient:"private@example.test",verificationCode:"123456"} as typeof reference)).toBe(false);expect(store.diagnostics(viewerId,"synthetic")).toEqual([reference]);
  });

});
