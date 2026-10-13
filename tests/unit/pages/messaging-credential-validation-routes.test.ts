/** @vitest-environment node */
/** Exercises own validation HTTP contracts with real schemas and classified credential results. @module messaging-credential-validation-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingCredentialValidationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-credential-validation-handler";
import type {ValidateMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/validate-messaging-connection-use-case";

/** @returns Own current service port, explicit native input and observable effect boundary. */
function routeFixture(){
  const tribeId=randomUUID(),connectionId=randomUUID(),operationId=randomUUID();
  const body={operationId,confirmed:true,expectedVersion:3};
  let outcome:Awaited<ReturnType<ValidateMessagingConnectionUseCase["execute"]>>={ok:true,value:{state:"completed",operationId,replayed:false,result:{id:connectionId,version:4,configurationVersion:2,credentialState:"valid",credentialMode:"test",validatedAt:"2026-10-07T13:00:00.000Z"}}};
  const execute=vi.fn(async()=>outcome),open=vi.fn(async()=>({validation:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}}));
  const request=(input:unknown=body,query="",origin="https://tutribu.example.test")=>new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/validate${query}`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(input)});
  return{tribeId,connectionId,operationId,body,execute,open,request,handler:createMessagingCredentialValidationHandler(open),context:{params:Promise.resolve({slug:"synthetic",connectionId})},getOutcome:()=>outcome,setOutcome:(value:typeof outcome)=>{outcome=value;}};
}

describe("credential validation HTTP",()=>{
  it("should forward only own normalized intent and request signal and publish minimal credential facts",async()=>{
    const fixture=routeFixture(),request=fixture.request();
    const response=await fixture.handler(request,fixture.context);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:"completed",result:{id:fixture.connectionId,version:4,configurationVersion:2,credentialState:"valid",credentialMode:"test"}});
    expect(fixture.execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({...fixture.body,tribeId:fixture.tribeId,connectionId:fixture.connectionId}),request.signal);
  });
  it.each([{apiKey:"synthetic-not-allowed"},{verified:true},{isTestMode:false},{actorUserId:randomUUID()},{expectedVersion:0},{confirmed:false}])("should reject injected credential or authority fields before composing services",async(extra)=>{
    const fixture=routeFixture();expect((await fixture.handler(fixture.request({...fixture.body,...extra}),fixture.context)).status).toBe(400);expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should reject foreign origin and query authority without touching the current account",async()=>{
    const fixture=routeFixture();expect((await fixture.handler(fixture.request(fixture.body,"","https://foreign.example.test"),fixture.context)).status).toBe(403);
    expect((await fixture.handler(fixture.request(fixture.body,"?role=leader"),fixture.context)).status).toBe(400);expect(fixture.open).not.toHaveBeenCalled();
  });
  it("should preserve progress and historical replay but reject a crossed resource or impossible counter",async()=>{
    const fixture=routeFixture(),original=fixture.getOutcome();if(!original.ok||original.value.state!=="completed")throw new Error("Expected complete own fixture");
    fixture.setOutcome({ok:true,value:{...original.value,replayed:true}});expect((await fixture.handler(fixture.request(),fixture.context)).status).toBe(200);
    fixture.setOutcome({ok:true,value:{state:"started",operationId:fixture.operationId}});expect((await fixture.handler(fixture.request(),fixture.context)).status).toBe(202);
    fixture.setOutcome({ok:true,value:{...original.value,result:{...original.value.result,id:randomUUID()}}});expect((await fixture.handler(fixture.request(),fixture.context)).status).toBe(500);
    fixture.setOutcome({ok:true,value:{...original.value,result:{...original.value.result,version:6}}});expect((await fixture.handler(fixture.request(),fixture.context)).status).toBe(500);
  });
  it("should return a classified failed inspection with completed metadata rather than success or raw provider text",async()=>{
    const fixture=routeFixture(),original=fixture.getOutcome();if(!original.ok||original.value.state!=="completed")throw new Error("Expected own result");
    fixture.setOutcome({ok:true,value:{...original.value,result:{...original.value.result,credentialState:"invalid",credentialMode:"unknown",failureCode:"invalid_credentials"}}});
    const response=await fixture.handler(fixture.request(),fixture.context);expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"invalid_credentials",operation:{operationId:fixture.operationId,state:"completed"}});
  });
});
