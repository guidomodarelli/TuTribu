/** @vitest-environment node */
/** Exercises explicit activation input/DTO guards without accepting client readiness, actor or policy settings. @module messaging-connection-activation-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConnectionActivationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-activation-handler";

describe("confirmed connection activation HTTP",()=>{
  it("should reject readiness/settings/authority or missing consent before protected composition",async()=>{
    const connectionId=randomUUID(),open=vi.fn(),handler=createMessagingConnectionActivationHandler(open),context={params:Promise.resolve({slug:"synthetic",connectionId})},url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/activate`,base={operationId:randomUUID(),expectedVersion:3,confirmed:true};
    for(const body of[{...base,confirmed:false},{...base,isTestMode:false},{...base,ready:true},{...base,role:"leader"},{...base,requiredChannels:["email"]},{...base,requiresAdditionalVerification:true}])expect((await handler(new Request(url,{method:"POST",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),context)).status).toBe(400);expect(open).not.toHaveBeenCalled();
  });
  it("should publish only the original coherent selection commit and verify its resource/CAS binding",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),operationId=randomUUID(),result={id:connectionId,name:"Conexión",version:4,configurationVersion:2,state:"active"as const,maskedCredential:"••••••••"as const,replaced:null,policyVersion:null},execute=vi.fn(async()=>({ok:true as const,value:{state:"completed"as const,operationId,replayed:false,result}}));
    const handler=createMessagingConnectionActivationHandler(async()=>({activation:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),request=new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/activate`,{method:"POST",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify({operationId,confirmed:true,expectedVersion:3})}),context={params:Promise.resolve({slug:"synthetic",connectionId})};
    const repeated=request.clone(),response=await handler(request,context);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({state:"completed",operationId,replayed:false,result});expect(execute).toHaveBeenCalledWith(expect.objectContaining({tribeId,connectionId,operationId,expectedVersion:3}));
    result.id=randomUUID();expect((await handler(repeated,context)).status).toBe(500);
  });
  it("should reject a foreign origin or query before opening native services",async()=>{
    const connectionId=randomUUID(),open=vi.fn(),handler=createMessagingConnectionActivationHandler(open),url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/activate`,context={params:Promise.resolve({slug:"synthetic",connectionId})},body=JSON.stringify({operationId:randomUUID(),expectedVersion:3,confirmed:true});
    expect((await handler(new Request(url,{method:"POST",headers:{origin:"https://foreign.example.test"},body}),context)).status).toBe(403);
    expect((await handler(new Request(`${url}?ready=true`,{method:"POST",headers:{origin:"https://tutribu.example.test"},body}),context)).status).toBe(400);expect(open).not.toHaveBeenCalled();
  });
  it("should preserve genuine progress and reject another operation's snapshot",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),operationId=randomUUID(),execute=vi.fn(async()=>({ok:true as const,value:{state:"started" as const,operationId,replayed:false}})),handler=createMessagingConnectionActivationHandler(async()=>({activation:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/activate`,context={params:Promise.resolve({slug:"synthetic",connectionId})};
    const request=()=>new Request(url,{method:"POST",headers:{origin:"https://tutribu.example.test"},body:JSON.stringify({operationId,confirmed:true,expectedVersion:3})});
    expect((await handler(request(),context)).status).toBe(202);execute.mockResolvedValueOnce({ok:true,value:{state:"started",operationId:randomUUID(),replayed:false}});expect((await handler(request(),context)).status).toBe(500);
  });
});
