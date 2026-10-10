/** @vitest-environment node */
/** Exercises real input/DTO guards for explicit immutable configuration changes. @module messaging-connection-configuration-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConnectionConfigurationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-configuration-handler";

describe("immutable configuration HTTP",()=>{
  it("should reject invalid channels/resources and browser authority before composing sensitive services",async()=>{
    const open=vi.fn(),handler=createMessagingConnectionConfigurationHandler(open),connectionId=randomUUID(),context={params:Promise.resolve({slug:"synthetic",connectionId})},url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/configuration`,base={operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",senderId:"manual-sender"};
    for(const body of[{...base,expectedVersion:0},{...base,apiKey:"private-input"},{...base,channel:"whatsapp"},{...base,channel:"sms",templateId:"not-for-sms"},{...base,role:"leader"}])expect((await handler(new Request(url,{method:"PUT",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    expect((await handler(new Request(url,{method:"PUT",headers:{origin:"https://foreign.example.test","content-type":"application/json"},body:JSON.stringify(base)}),context)).status).toBe(403);expect(open).not.toHaveBeenCalled();
  });
  it("should return minimal original configuration metadata and preserve no-op versions",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),body={operationId:randomUUID(),confirmed:true as const,expectedVersion:2,channel:"email"as const,senderId:"manual-sender"},result={id:connectionId,name:"Conexión",version:2,configurationVersion:2,state:"draft"as const,maskedCredential:"••••••••"as const,changed:false},execute=vi.fn(async()=>({ok:true as const,value:{state:"completed"as const,operationId:body.operationId,replayed:false,result}}));
    const handler=createMessagingConnectionConfigurationHandler(async()=>({configuration:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),response=await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/configuration`,{method:"PUT",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve({slug:"synthetic",connectionId})});
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({state:"completed",operationId:body.operationId,replayed:false,result});
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({...body,tribeId,connectionId}),expect.any(AbortSignal));
  });
});
