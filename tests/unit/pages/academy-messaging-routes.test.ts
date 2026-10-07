/** @vitest-environment node */
/** Exercises real Zod, own HTTP DTO guards and creation use-case service boundaries. @module academy-messaging-routes-tests */
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { createMessagingConnectionHandlers } from "@/src/modules/messaging/infrastructure/api/messaging-connection-handlers";
import type { ManageMessagingConnectionsUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-connections-use-cases";

/** @returns Explicit input, own current service port and native HTTP boundary without SDK mocks. */
function creationRouteFixture(){
  const tribeId=randomUUID(),operationId=randomUUID();
  const body={operationId,confirmed:true,providerId:"zavu",name:"  Conexión de prueba  ",apiKey:randomUUID()};
  let outcome:Awaited<ReturnType<ManageMessagingConnectionsUseCases["create"]>>={ok:true,value:{state:"completed",operationId,replayed:false,result:{id:randomUUID(),name:body.name.trim(),version:1,configurationVersion:1,state:"draft",maskedCredential:"••••••••"}}};
  const create=vi.fn(async()=>outcome),open=vi.fn(async()=>({connections:{create},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}}));
  const request=(input:unknown=body,origin="https://tutribu.example.test")=>new Request("https://tutribu.example.test/api/tribes/synthetic/messaging/connections",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(input)});
  return{body,operationId,tribeId,create,open,request,handlers:createMessagingConnectionHandlers(open),context:{params:Promise.resolve({slug:"synthetic"})},setOutcome:(value:typeof outcome)=>{outcome=value;},getOutcome:()=>outcome};
}

describe("protected connection creation route",()=>{
  it("should normalize explicit creation once and return only initial metadata without plaintext",async()=>{
    const fixture=creationRouteFixture(),response=await fixture.handlers.create(fixture.request(),fixture.context),published=await response.json();
    expect(response.status).toBe(201);
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({tribeId:fixture.tribeId,operationId:fixture.operationId,name:"Conexión de prueba",apiKey:fixture.body.apiKey}));
    expect(published).toMatchObject({state:"completed",result:{name:"Conexión de prueba",version:1,configurationVersion:1,state:"draft",maskedCredential:"••••••••"}});
    expect(JSON.stringify(published)).not.toContain(fixture.body.apiKey);
  });
  it.each([{apiHost:"https://other.example.test"},{role:"leader"},{expectedVersion:1},{confirmed:false},{providerId:"other"},{apiKey:""}])("should reject unsupported creation authority or fields before opening services",async(extra)=>{
    const fixture=creationRouteFixture();
    expect((await fixture.handlers.create(fixture.request({...fixture.body,...extra}),fixture.context)).status).toBe(400);
    expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should deny a foreign origin without resolving an account or storing a credential",async()=>{
    const fixture=creationRouteFixture();
    expect((await fixture.handlers.create(fixture.request(fixture.body,"https://other.example.test"),fixture.context)).status).toBe(403);
    expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should preserve conflict and recency failures while stripping their private causes",async()=>{
    const fixture=creationRouteFixture();
    fixture.setOutcome({ok:false,failure:{code:"connection_conflict",cause:{credential:fixture.body.apiKey}}});
    const response=await fixture.handlers.create(fixture.request(),fixture.context),published=await response.json();
    expect(response.status).toBe(409);expect(published.code).toBe("connection_conflict");
    expect(JSON.stringify(published)).not.toContain(fixture.body.apiKey);
    fixture.setOutcome({ok:false,failure:{code:"reauthentication_required"}});
    expect((await fixture.handlers.create(fixture.request(),fixture.context)).status).toBe(401);
  });
  it("should publish only original replay/progress and reject a crossed UUID or fabricated initial version",async()=>{
    const fixture=creationRouteFixture(),current=fixture.getOutcome();
    if(!current.ok||current.value.state!=="completed")throw new Error("Expected own completed fixture");
    fixture.setOutcome({ok:true,value:{...current.value,replayed:true}});
    expect((await fixture.handlers.create(fixture.request(),fixture.context)).status).toBe(200);
    fixture.setOutcome({ok:true,value:{state:"started",operationId:fixture.operationId}});
    expect((await fixture.handlers.create(fixture.request(),fixture.context)).status).toBe(202);
    fixture.setOutcome({ok:true,value:{state:"started",operationId:randomUUID()}});
    expect((await fixture.handlers.create(fixture.request(),fixture.context)).status).toBe(500);
    fixture.setOutcome({ok:true,value:{...current.value,result:{...current.value.result,version:2}}});
    expect((await fixture.handlers.create(fixture.request(),fixture.context)).status).toBe(500);
  });
});
