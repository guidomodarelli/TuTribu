/** @vitest-environment node */
/** Exercises same-origin connection transport and own public DTO guards without a provider or auth SDK mock. @module messaging-connections-browser-client-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConnectionsBrowserClient} from "@/lib/messaging/messaging-connections-api-client";

describe("connection wizard own browser transport",()=>{
  it("should send one explicit transient key with its original UUID and expose only coherent created metadata",async()=>{
    const operationId=randomUUID(),input={operationId,confirmed:true as const,providerId:"zavu" as const,name:"Conexión",apiKey:randomUUID()},value={state:"completed",operationId,replayed:false,result:{id:randomUUID(),name:input.name,version:1,configurationVersion:1,state:"draft",maskedCredential:"••••••••"}},fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(value,{status:201})),client=createMessagingConnectionsBrowserClient({fetch,viewer:async()=>({status:"ready",value:{id:randomUUID()}})});
    expect(await client.create("synthetic",input,new AbortController().signal)).toEqual({status:"ready",value});expect(fetch).toHaveBeenCalledTimes(1);
    const request=fetch.mock.calls[0];expect(request[0]).toBe("/api/tribes/synthetic/messaging/connections");expect(request[1]).toMatchObject({method:"POST",credentials:"same-origin",cache:"no-store",body:JSON.stringify(input)});
  });
  it("should retain uncertainty on a lost write or crossed UUID without repeating the request",async()=>{
    const input={operationId:randomUUID(),confirmed:true as const,providerId:"zavu" as const,name:"Conexión",apiKey:randomUUID()},fetch=vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError("synthetic transport loss")),client=createMessagingConnectionsBrowserClient({fetch,viewer:async()=>({status:"ready",value:null})});
    expect(await client.create("synthetic",input,new AbortController().signal)).toMatchObject({status:"failed",uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(Response.json({state:"started",operationId:randomUUID()}));expect(await client.create("synthetic",input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("should read an original operation without a key and close an aborted read without a request",async()=>{
    const operationId=randomUUID(),value={type:"save_messaging_credentials",state:"started",operationId,replayed:true},fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(value)),client=createMessagingConnectionsBrowserClient({fetch,viewer:async()=>({status:"ready",value:null})}),controller=new AbortController();
    expect(await client.operation("synthetic",operationId,controller.signal)).toEqual({status:"ready",value});expect(fetch).toHaveBeenCalledTimes(1);controller.abort();expect(await client.operation("synthetic",operationId,controller.signal)).toEqual({status:"aborted"});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("should classify cancellation during JSON body consumption as an aborted read without stale error feedback",async()=>{
    const controller=new AbortController(),operationId=randomUUID();let body!:ReadableStreamDefaultController<Uint8Array>;
    const response=new Response(new ReadableStream<Uint8Array>({start(stream){body=stream;}})),fetch=vi.fn<typeof globalThis.fetch>(async()=>response),client=createMessagingConnectionsBrowserClient({fetch,viewer:async()=>({status:"ready",value:null})});
    const reading=client.operation("synthetic",operationId,controller.signal);await Promise.resolve();controller.abort();body.error(new DOMException("synthetic abort","AbortError"));expect(await reading).toEqual({status:"aborted"});
  });
});
