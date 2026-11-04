/** @vitest-environment node */
/** Exercises real input/DTO guards for explicit immutable configuration changes. @module messaging-connection-configuration-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingConnectionConfigurationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-configuration-handler";

describe("immutable configuration HTTP",()=>{
  it.each(["fax","","EMAIL"])("should reject an unsupported channel %j before native composition or provider access",async(channel)=>{
    // Given a confirmed configuration request with one invalid external channel value.
    const open=vi.fn(),handler=createMessagingConnectionConfigurationHandler(open),connectionId=randomUUID();
    const body={operationId:randomUUID(),confirmed:true,expectedVersion:1,channel,senderId:"synthetic-sender"};
    const response=await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/configuration`,{
      method:"PUT",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body),
    }),{params:Promise.resolve({slug:"synthetic",connectionId})});

    // Then the real input boundary closes the request before any sensitive service is opened.
    expect(response.status).toBe(400);expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({code:"invalid_input",requestId:expect.any(String)});
    expect(open).not.toHaveBeenCalled();
  });
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
  it("should answer 424 when Zavu failed before anything was registered, and keep a 5xx once the original may have committed",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),body={operationId:randomUUID(),confirmed:true as const,expectedVersion:2,channel:"email"as const,senderId:"manual-sender"},url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/configuration`;
    const request=()=>new Request(url,{method:"PUT",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),context={params:Promise.resolve({slug:"synthetic",connectionId})};
    const execute=vi.fn().mockResolvedValueOnce({ok:false as const,failure:{code:"dependency_unavailable" as const,definitive:true}}).mockResolvedValueOnce({ok:false as const,failure:{code:"dependency_unavailable" as const}});
    const handler=createMessagingConnectionConfigurationHandler(async()=>({configuration:{execute},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}}));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>undefined),error=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    try{
      const definitive=await handler(request(),context);expect(definitive.status).toBe(424);expect(await definitive.json()).toEqual({code:"dependency_unavailable",message:expect.any(String),requestId:expect.any(String)});
      expect((await handler(request(),context)).status).toBe(503);
    }finally{warn.mockRestore();error.mockRestore();}
  });
  it("should keep the cause of a failed tribe routing in the log and answer it as definitive, since nothing was registered",async()=>{
    const connectionId=randomUUID(),body={operationId:randomUUID(),confirmed:true as const,expectedVersion:2,channel:"email"as const,senderId:"manual-sender"},execute=vi.fn();
    class SyntheticDatabaseError extends Error{readonly code="57P01";constructor(){super("synthetic database failure");this.name="SyntheticDatabaseError";}}
    const handler=createMessagingConnectionConfigurationHandler(async()=>({configuration:{execute},resolveTribe:{execute:async()=>({ok:false as const,failure:{code:"unexpected_failure" as const,cause:new SyntheticDatabaseError()}})}}));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>undefined),error=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    try{
      const response=await handler(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/configuration`,{method:"PUT",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve({slug:"synthetic",connectionId})});
      expect(response.status).toBe(424);expect(await response.json()).toMatchObject({code:"unexpected_failure"});expect(execute).not.toHaveBeenCalled();
      // A database failure stays an error in the log although it is answered below 5xx.
      expect(warn).not.toHaveBeenCalled();const logged=JSON.stringify(error.mock.calls);
      expect(logged).toContain("SyntheticDatabaseError");expect(logged).toContain("57P01");expect(logged).not.toContain("synthetic database failure");
    }finally{warn.mockRestore();error.mockRestore();}
  });
});
