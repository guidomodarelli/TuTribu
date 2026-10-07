/** @vitest-environment node */
/** Exercises real own input/output guards before resource listing opens sensitive services. @module messaging-resource-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingResourceHandler} from "@/src/modules/messaging/infrastructure/api/messaging-resource-handler";
import type {ReadMessagingResourcesUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-resources-use-case";

describe("resource listing HTTP",()=>{
  it("should reject invalid pagination, malformed cursors and browser authority before opening services",async()=>{
    const open=vi.fn(),handler=createMessagingResourceHandler("senders",open),connectionId=randomUUID(),context={params:Promise.resolve({slug:"synthetic",connectionId})};
    for(const query of["limit=0","limit=51","cursor=not-json","role=leader","apiKey=fixture-private","cursor="+encodeURIComponent(JSON.stringify({tribeId:randomUUID(),connectionId,configurationVersion:1,kind:"senders",offset:-1}))]){
      const response=await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/senders?${query}`),context);
      expect(response.status).toBe(400);
    }
    expect(open).not.toHaveBeenCalled();
  });
  it("should publish current own references with no-store and strip unrelated provider fields",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),senderId=randomUUID(),privateSecret=randomUUID();
    const execute=vi.fn(async()=>({ok:true as const,value:{connectionId,configurationVersion:1,items:[{id:senderId,label:"Remitente",channels:["email"as const],readiness:"ready"as const,webhook:{secret:privateSecret}}]}}));
    const handler=createMessagingResourceHandler("senders",async()=>({resources:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}}));
    const response=await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/senders?limit=1`),{params:Promise.resolve({slug:"synthetic",connectionId})});
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({connectionId,configurationVersion:1,items:[{id:senderId,label:"Remitente",channels:["email"],readiness:"ready"}]});
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({kind:"senders",tribeId,connectionId,limit:1}),expect.any(AbortSignal));
  });
  it("should reject unusable own output and a connection different from the requested route",async()=>{
    const connectionId=randomUUID(),outcome:Awaited<ReturnType<ReadMessagingResourcesUseCase["execute"]>>={ok:true,value:{connectionId:randomUUID(),configurationVersion:1,items:[]}};
    const handler=createMessagingResourceHandler("templates",async()=>({resources:{execute:async()=>outcome},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId:randomUUID()}})}}));
    const request=new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/templates`),context={params:Promise.resolve({slug:"synthetic",connectionId})};
    expect((await handler(request,context)).status).toBe(500);
    outcome.value.connectionId=connectionId;Object.assign(outcome.value,{items:[{id:"synthetic",readiness:"provider-arbitrary-state"}]});expect((await handler(request,context)).status).toBe(500);
  });
});
