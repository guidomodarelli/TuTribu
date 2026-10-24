/** @vitest-environment node */
/** Exercises diagnostic issuance/verification and delivery HTTP guards without browser-selected authority or arbitrary sends. @module messaging-diagnostic-routes-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingDiagnosticHandlers} from "@/src/modules/messaging/infrastructure/api/messaging-diagnostic-handlers";

describe("diagnostic HTTP boundaries",()=>{
  it("should reject browser code/keys/sender/purpose and missing explicit consent before sensitive composition",async()=>{
    const open=vi.fn(),handlers=createMessagingDiagnosticHandlers(open),connectionId=randomUUID(),base={operationId:randomUUID(),confirmed:true,expectedVersion:1,channel:"email",recipient:"leader@example.test"},context={params:Promise.resolve({slug:"synthetic",connectionId})},url=`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/diagnostics`;
    for(const body of[{...base,confirmed:false},{...base,code:"123456"},{...base,apiKey:"fixture-input"},{...base,senderId:"fixture-sender"},{...base,purpose:"admission"},{...base,verified:true}])expect((await handlers.issue(new Request(url,{method:"POST",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify(body)}),context)).status).toBe(400);
    expect(open).not.toHaveBeenCalled();
    expect((await handlers.issue(new Request(url,{method:"POST",headers:{origin:"https://foreign.example.test","content-type":"application/json"},body:JSON.stringify(base)}),context)).status).toBe(403);expect(open).not.toHaveBeenCalled();
  });
  it("should publish an own masked challenge without claiming delivery or admission proof",async()=>{
    const connectionId=randomUUID(),tribeId=randomUUID(),operationId=randomUUID(),result={outcome:"issued"as const,connectionId,connectionVersion:1,diagnosticId:randomUUID(),challengeId:randomUUID(),deliveryId:randomUUID(),channel:"email"as const,maskedDestination:"l••••@example.test",expiresAt:new Date().toISOString(),resendAllowedAt:new Date().toISOString()},issue=vi.fn(async()=>({ok:true as const,value:{state:"completed"as const,operationId,replayed:false,result}}));
    const handlers=createMessagingDiagnosticHandlers(async()=>({issue:{execute:issue},verify:{execute:async()=>{throw new Error("Unexpected verify");}},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId}})}})),response=await handlers.issue(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/diagnostics`,{method:"POST",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify({operationId,confirmed:true,expectedVersion:1,channel:"email",recipient:"leader@example.test"})}),{params:Promise.resolve({slug:"synthetic",connectionId})});
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toEqual({state:"completed",operationId,replayed:false,result});expect(issue).toHaveBeenCalledWith(expect.objectContaining({tribeId,connectionId,operationId}));
  });
  it("should map local verification denial safely and never return an admission proof",async()=>{
    const connectionId=randomUUID(),diagnosticId=randomUUID(),operationId=randomUUID(),handlers=createMessagingDiagnosticHandlers(async()=>({issue:{execute:async()=>{throw new Error("Unexpected issuance");}},verify:{execute:async()=>({ok:true as const,value:{state:"completed"as const,operationId,replayed:false,result:{outcome:"denied"as const,code:"verification_code_incorrect"as const}}})},resolveTribe:{execute:async()=>({ok:true as const,value:{tribeId:randomUUID()}})}}));
    const response=await handlers.verify(new Request(`https://tutribu.example.test/api/tribes/synthetic/messaging/connections/${connectionId}/diagnostics/${diagnosticId}/verify`,{method:"POST",headers:{origin:"https://tutribu.example.test","content-type":"application/json"},body:JSON.stringify({operationId,confirmed:true,verificationCode:"123456"})}),{params:Promise.resolve({slug:"synthetic",connectionId,diagnosticId})});expect(response.status).toBe(422);const body=await response.json();expect(body).toMatchObject({code:"verification_code_incorrect",operation:{operationId,state:"completed"}});expect(body).not.toHaveProperty("proofId");
  });
});
