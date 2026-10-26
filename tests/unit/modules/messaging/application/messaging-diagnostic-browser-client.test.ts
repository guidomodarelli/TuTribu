/** @vitest-environment node */
/** Exercises explicit own diagnostic transport with real DTO guards and a closed owned HTTP boundary. @module messaging-diagnostic-browser-client-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createMessagingDiagnosticBrowserClient} from "@/lib/messaging/messaging-diagnostic-api-client";

/** @returns A scoped issued own challenge, without plaintext destination, code or credential. */
function diagnosticFixture(){const connectionId=randomUUID(),operationId=randomUUID(),diagnosticId=randomUUID(),value={state:"completed",operationId,replayed:false,result:{outcome:"issued",diagnosticId,challengeId:randomUUID(),deliveryId:randomUUID(),connectionId,connectionVersion:2,channel:"email",maskedDestination:"d•••@example.test",expiresAt:"2026-10-08T05:00:00Z",resendAllowedAt:"2026-10-08T04:55:00Z"}};return{connectionId,operationId,diagnosticId,value,scope:{slug:"synthetic",connectionId,configurationVersion:2}};}

describe("diagnostic browser transport",()=>{
  it("should issue only one explicitly confirmed original without a sender, purpose or key and guard its exact scope",async()=>{
    const fixture=diagnosticFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(fixture.value)),client=createMessagingDiagnosticBrowserClient({fetch}),input={operationId:fixture.operationId,expectedVersion:4,confirmed:true as const,channel:"email" as const,recipient:"diagnostic@example.test"};
    expect(fetch).not.toHaveBeenCalled();expect(await client.issue(fixture.scope,input,new AbortController().signal)).toEqual({status:"ready",value:fixture.value});expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/tribes/synthetic/messaging/connections/${fixture.connectionId}/diagnostics`,expect.objectContaining({method:"POST",body:JSON.stringify(input),credentials:"same-origin",cache:"no-store"}));
  });
  it("should preserve a committed original UUID when dispatch observation is unresolved without repeating a billable action",async()=>{
    const fixture=diagnosticFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({code:"operation_unresolved",message:"La operación está registrada y su resultado todavía no se confirmó. Consultá su estado.",requestId:randomUUID(),operation:{operationId:fixture.operationId,state:"completed"}},{status:202})),client=createMessagingDiagnosticBrowserClient({fetch});
    expect(await client.issue(fixture.scope,{operationId:fixture.operationId,expectedVersion:4,confirmed:true,channel:"email",recipient:"diagnostic@example.test"},new AbortController().signal)).toMatchObject({status:"failed",code:"operation_unresolved",uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("should reject a crossed configuration/channel or verification proof without exposing the result",async()=>{
    const fixture=diagnosticFixture(),fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({...fixture.value,result:{...fixture.value.result,connectionVersion:3}})),client=createMessagingDiagnosticBrowserClient({fetch}),input={operationId:fixture.operationId,expectedVersion:4,confirmed:true as const,channel:"email" as const,recipient:"diagnostic@example.test"};
    expect(await client.issue(fixture.scope,input,new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});
    fetch.mockResolvedValueOnce(Response.json({state:"completed",operationId:fixture.operationId,replayed:false,result:{outcome:"verified",diagnosticId:fixture.diagnosticId,connectionVersion:2,channel:"email",validatedAt:"2026-10-08T04:55:00Z",capabilityState:"prepared",proofId:randomUUID()}}));expect(await client.verify({...fixture.scope,diagnosticId:fixture.diagnosticId,channel:"email"},{operationId:fixture.operationId,confirmed:true,verificationCode:"123456"},new AbortController().signal)).toMatchObject({status:"failed",code:"public_contract_unusable",uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("should read only the associated diagnostic delivery and close cancellation without issuing another request",async()=>{
    const fixture=diagnosticFixture(),delivery={id:fixture.value.result.deliveryId,state:"accepted",purpose:"connection_diagnostic",channel:"email",createdAt:"2026-10-08T04:55:00Z"},fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json(delivery)),client=createMessagingDiagnosticBrowserClient({fetch}),controller=new AbortController();expect(await client.delivery({slug:"synthetic",deliveryId:delivery.id,channel:"email"},controller.signal)).toEqual({status:"ready",value:delivery});controller.abort();expect(await client.delivery({slug:"synthetic",deliveryId:delivery.id,channel:"email"},controller.signal)).toEqual({status:"aborted"});expect(fetch).toHaveBeenCalledTimes(1);
  });
});
