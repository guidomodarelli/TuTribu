/** @vitest-environment node */
/** Exercises exact sensitive activation authority without loading keys, sending or trusting browser readiness. @module activate-messaging-connection-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ActivateMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/activate-messaging-connection-use-case";
import {MessagingConnectionOperationError} from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";

/** @returns Own authority/storage ports with no provider or SecretStore capability. */
function activationFixture(){
  const now=new Date(),connectionId=randomUUID(),context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:2,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"activate_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
  const input={tribeId:context.tribeId,connectionId,requestId:context.requestId,operationId:randomUUID(),expectedVersion:3,confirmed:true as const};
  const resolve=vi.fn(async()=>({allowed:true as const,context})),activate=vi.fn(async()=>({state:"completed"as const,operationId:input.operationId,replayed:false,result:{id:connectionId,name:"Conexión",version:4,configurationVersion:2,state:"active"as const,maskedCredential:"••••••••"as const,replaced:null,policyVersion:null}}));
  return{context,input,resolve,activate,useCase:new ActivateMessagingConnectionUseCase({execute:resolve},{activate})};
}

describe("sensitive candidate activation",()=>{
  it("should resolve exact current activation authority and pass only original confirmation/CAS to the owner",async()=>{
    const fixture=activationFixture();expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ok:true,value:{state:"completed",result:{version:4,state:"active"}}});
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith({tribeId:fixture.context.tribeId,connectionId:fixture.context.connectionId,requestId:fixture.context.requestId,operation:"activate_messaging_connection"});expect(fixture.activate).toHaveBeenCalledExactlyOnceWith(fixture.context,fixture.input);
  });
  it("should preserve a genuinely unresolved original operation without turning it into another activation",async()=>{
    const fixture=activationFixture();fixture.activate.mockRejectedValueOnce(new MessagingConnectionOperationError("operation_unresolved",{operationId:fixture.input.operationId}));
    expect(await fixture.useCase.execute(fixture.input)).toMatchObject({ok:false,failure:{code:"operation_unresolved",operation:{operationId:fixture.input.operationId,state:"started"}}});expect(fixture.activate).toHaveBeenCalledTimes(1);
  });
  it("should deny revoked activation authority before entering the selection writer",async()=>{
    const fixture=activationFixture(),resolve=vi.fn(async()=>({allowed:false as const,failure:messagingFailure("permission_denied")})),useCase=new ActivateMessagingConnectionUseCase({execute:resolve},{activate:fixture.activate});
    expect(await useCase.execute(fixture.input)).toMatchObject({ok:false,failure:{code:"permission_denied"}});expect(fixture.activate).not.toHaveBeenCalled();
  });
});
