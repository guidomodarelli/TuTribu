/** @vitest-environment node */
/** Exercises own pagination/configuration transport with real schemas and an owned HTTP boundary. @module messaging-resource-browser-client-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingResourcesBrowserClient} from "@/lib/messaging/messaging-resources-api-client";

/** @returns Current explicit UI scope; it conveys no authority. */
function scopeFixture(){return{slug:"synthetic",connectionId:randomUUID(),configurationVersion:2};}

describe("resource browser transport",()=>{
  it("should read only one own resource page without auto-selection and preserve an encoded own continuation",async()=>{
    const scope=scopeFixture(),cursor=JSON.stringify({connectionId:scope.connectionId,configurationVersion:2,offset:10,kind:"senders",tribeId:randomUUID()}),value={connectionId:scope.connectionId,configurationVersion:2,items:[{id:randomUUID(),label:"Remitente autorizado",channels:["email"],readiness:"ready"}],nextCursor:cursor},fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(value)),client=createMessagingResourcesBrowserClient({fetch});
    expect(await client.read({...scope,kind:"senders"},new AbortController().signal)).toEqual({status:"ready",value});expect(fetch).toHaveBeenCalledTimes(1);expect(new URL(String(fetch.mock.calls[0][0]),"https://synthetic.invalid").pathname).toBe(`/api/tribes/synthetic/messaging/connections/${scope.connectionId}/senders`);
    await client.read({...scope,kind:"senders",cursor},new AbortController().signal);expect(new URL(String(fetch.mock.calls[1][0]),"https://synthetic.invalid").searchParams.get("cursor")).toBe(cursor);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("should reject crossed current configuration pages without publishing their items",async()=>{
    const scope=scopeFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({connectionId:scope.connectionId,configurationVersion:3,items:[{id:randomUUID(),label:"Versión ajena",channels:["email"],readiness:"ready"}]})),client=createMessagingResourcesBrowserClient({fetch});
    expect(await client.read({...scope,kind:"senders"},new AbortController().signal)).toMatchObject({status:"failed",code:"connection_conflict",uncertain:false});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("should save one explicit channel version without a key and bind id, UUID and both counters",async()=>{
    const scope=scopeFixture(),operationId=randomUUID(),input={operationId,expectedVersion:4,confirmed:true as const,channel:"email" as const,senderId:randomUUID()},value={operationId,state:"completed",replayed:false,result:{id:scope.connectionId,name:"Candidata",version:5,configurationVersion:3,state:"draft",maskedCredential:"••••••••",changed:true}},fetch=vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(value)),client=createMessagingResourcesBrowserClient({fetch});
    expect(await client.configure(scope,input,new AbortController().signal)).toEqual({status:"ready",value});expect(fetch.mock.calls[0]).toEqual([`/api/tribes/synthetic/messaging/connections/${scope.connectionId}/configuration`,expect.objectContaining({method:"PUT",body:JSON.stringify(input),credentials:"same-origin",cache:"no-store"})]);
    fetch.mockResolvedValueOnce(Response.json({...value,result:{...value.result,configurationVersion:2}}));expect(await client.configure(scope,input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("should preserve uncertainty on an unusable write response and stop aborted reads without another request",async()=>{
    const scope=scopeFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response("synthetic-unusable")),client=createMessagingResourcesBrowserClient({fetch}),controller=new AbortController();
    expect(await client.configure(scope,{operationId:randomUUID(),expectedVersion:4,confirmed:true,channel:"sms",senderId:randomUUID()},controller.signal)).toMatchObject({status:"failed",uncertain:true});controller.abort();expect(await client.read({...scope,kind:"senders"},controller.signal)).toEqual({status:"aborted"});expect(fetch).toHaveBeenCalledTimes(1);
  });
});
