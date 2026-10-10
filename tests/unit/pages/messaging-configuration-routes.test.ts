/** @vitest-environment node */
/** Exercises own configuration response guards and rejects caller-selected audience. @module messaging-configuration-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConfigurationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-configuration-handler";
import type {ReadMessagingConfigurationUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-configuration-use-case";

describe("role-scoped configuration HTTP",()=>{
  it("should publish real absence with no-store and reject query audience before opening services",async()=>{
    const tribeId=randomUUID(),execute=vi.fn(async()=>({ok:true as const,value:{audience:"leader"as const,selected:null,candidate:null,usage:{state:"not_configured"as const,policy:null}}}));
    const open=vi.fn(async()=>({configuration:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),handler=createMessagingConfigurationHandler(open),context={params:Promise.resolve({slug:"synthetic"})};
    const response=await handler(new Request("https://tutribu.example.test/api/tribes/synthetic/messaging/configuration"),context);
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}});
    open.mockClear();expect((await handler(new Request("https://tutribu.example.test/api/tribes/synthetic/messaging/configuration?role=leader"),context)).status).toBe(400);expect(open).not.toHaveBeenCalled();
  });
  it("should keep guardian output minimal and reject injected private metadata",async()=>{
    const outcome:Awaited<ReturnType<ReadMessagingConfigurationUseCase["execute"]>>={ok:true,value:{audience:"guardian",operationalAlert:"attention_required"}};
    const handler=createMessagingConfigurationHandler(async()=>({configuration:{execute:async()=>outcome},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId:randomUUID()}})}})),request=new Request("https://tutribu.example.test/api/tribes/synthetic/messaging/configuration"),context={params:Promise.resolve({slug:"synthetic"})};
    expect(await(await handler(request,context)).json()).toEqual({audience:"guardian",operationalAlert:"attention_required"});
    if(!outcome.ok)throw new Error("Expected own result");Object.assign(outcome.value,{candidate:{apiKey:"private fixture field"}});
    expect((await handler(request,context)).status).toBe(500);
  });
});
