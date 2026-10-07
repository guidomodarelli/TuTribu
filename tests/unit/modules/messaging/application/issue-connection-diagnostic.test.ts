/** @vitest-environment node */
/** Exercises explicit consent, canonical destinations and recovery without conflating dispatch with verification. @module issue-connection-diagnostic-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {IssueConnectionDiagnosticUseCase} from "@/src/modules/messaging/application/use-cases/issue-connection-diagnostic-use-case";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Owned authority/issuance/dispatch ports; platform and domain normalization remain real. */
function diagnosticFixture(){
  const now=new Date(),connectionId=randomUUID(),deliveryId=randomUUID(),context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:2,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"diagnose_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
  const input={tribeId:context.tribeId,connectionId,requestId:context.requestId,operationId:randomUUID(),expectedVersion:3,confirmed:true as const,channel:"email"as const,recipient:" Leader+code@Example.test "};
  const value={state:"completed"as const,operationId:input.operationId,replayed:false,result:{outcome:"issued"as const,diagnosticId:randomUUID(),challengeId:randomUUID(),deliveryId,connectionId,connectionVersion:2,channel:"email"as const,maskedDestination:"l•••@example.test",expiresAt:new Date(now.getTime()+600_000).toISOString(),resendAllowedAt:new Date(now.getTime()+60_000).toISOString()}};
  const resolve=vi.fn(async()=>({allowed:true as const,context})),issue=vi.fn(async()=>value),dispatch=vi.fn(async()=>{});
  return{context,input,value,resolve,issue,dispatch,useCase:new IssueConnectionDiagnosticUseCase({execute:resolve},{issue},{dispatch})};
}

describe("explicit diagnostic issuance",()=>{
  it("should normalize the destination and commit before dispatching only the returned exact delivery",async()=>{
    const fixture=diagnosticFixture();
    expect(await fixture.useCase.execute(fixture.input)).toEqual({ok:true,value:fixture.value});
    expect(fixture.issue).toHaveBeenCalledWith(fixture.context,expect.objectContaining({recipient:{type:"email",value:"leader+code@example.test"},expectedVersion:3,operationId:fixture.input.operationId}));
    expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith(fixture.context,fixture.value.result.deliveryId);expect(fixture.issue.mock.invocationCallOrder[0]).toBeLessThan(fixture.dispatch.mock.invocationCallOrder[0]);
  });
  it("should preserve an original replay without another dispatch or newly generated code",async()=>{
    const fixture=diagnosticFixture();fixture.value.replayed=true;
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ok:true,value:{replayed:true}});expect(fixture.dispatch).not.toHaveBeenCalled();
  });
  it("should preserve a confirmed issuance when its dispatch cannot be observed, without repeating it",async()=>{
    const fixture=diagnosticFixture();fixture.dispatch.mockRejectedValueOnce(new Error("Owned dispatch observation failed"));
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ok:false,failure:{code:"operation_unresolved",operation:{operationId:fixture.input.operationId,state:"completed"}}});expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });
  it("should reject an ambiguous phone or an incoherent country before issuing or dispatching",async()=>{
    const fixture=diagnosticFixture();
    for(const input of[{...fixture.input,channel:"sms"as const,recipient:"1155501234"},{...fixture.input,channel:"whatsapp"as const,recipient:"+5491155501234",country:"US"}])expect(await fixture.useCase.execute(input)).toMatchObject({ok:false,failure:{code:"invalid_input"}});
    expect(fixture.issue).not.toHaveBeenCalled();expect(fixture.dispatch).not.toHaveBeenCalled();
  });
});
