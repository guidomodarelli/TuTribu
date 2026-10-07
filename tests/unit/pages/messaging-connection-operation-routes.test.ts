/** @vitest-environment node */
/** Exercises readonly original connection recovery boundaries without caller-selected authority or namespace. @module messaging-connection-operation-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConnectionOperationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-operation-handler";
import type {MessagingConnectionOperationRecovery} from "@/src/modules/messaging/application/results/messaging-connection-operation-result";

describe("readonly original connection operation HTTP",()=>{
  it("should bind the original UUID and current tenant with no writer input and no-store output",async()=>{
    const tribeId=randomUUID(),operationId=randomUUID(),value:MessagingConnectionOperationRecovery={type:"save_messaging_credentials",state:"completed",operationId,replayed:true,result:{id:randomUUID(),name:"Conexión",version:1,configurationVersion:1,state:"draft",maskedCredential:"••••••••"}},execute=vi.fn(async()=>({ok:true as const,value})),handler=createMessagingConnectionOperationHandler(async()=>({operation:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),request=new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/operations/${operationId}`),context={params:Promise.resolve({slug:"synthetic",operationId})};
    const response=await handler(request,context);expect(response.status).toBe(200);expect(await response.json()).toEqual(value);expect(response.headers.get("cache-control")).toContain("no-store");expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({tribeId,operationId}));
  });
  it("should reject browser actor, namespace or readiness filters before protected composition",async()=>{
    const operationId=randomUUID(),open=vi.fn(),handler=createMessagingConnectionOperationHandler(open),context={params:Promise.resolve({slug:"synthetic",operationId})};
    for(const query of["role=leader","actorUserId=other","type=save_messaging_credentials","ready=true"]){expect((await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/operations/${operationId}?${query}`),context)).status).toBe(400);}expect(open).not.toHaveBeenCalled();
  });
  it("should reject a crossed original UUID returned by the own service instead of publishing it",async()=>{
    const operationId=randomUUID(),handler=createMessagingConnectionOperationHandler(async()=>({operation:{execute:async()=>({ok:true as const,value:{type:"save_messaging_credentials",state:"started",operationId:randomUUID(),replayed:true}})},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId:randomUUID()}})}}));
    expect((await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/operations/${operationId}`),{params:Promise.resolve({slug:"synthetic",operationId})})).status).toBe(500);
  });
});
