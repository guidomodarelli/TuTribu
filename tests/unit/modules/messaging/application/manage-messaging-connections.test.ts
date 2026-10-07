/** Exercises creation authority and original-result behavior through owned account/leadership/storage ports. @module manage-messaging-connections-tests */
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { ManageMessagingConnectionsUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-connections-use-cases";
import type { MessagingAuthenticatedAccount,MessagingLeadershipFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";

/** @returns Current owned identity/recency and observable creation port, with no mocked platform library. */
function creationFixture(){
  const now=new Date("2026-10-07T12:00:00.000Z"),tribeId=randomUUID(),userId=randomUUID(),sessionId=randomUUID(),accountId=randomUUID(),subject=randomUUID(),operationId=randomUUID();
  const account:MessagingAuthenticatedAccount={userId,session:{id:sessionId,expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:{id:accountId,subject},recentAuthentication:[{id:randomUUID(),intentId:randomUUID(),userId,sessionId,accountId,subject,tribeId,resourceId:tribeId,operation:"save_messaging_credentials",authenticatedAt:now,verifiedAt:now,validUntil:new Date(now.getTime()+540_000),invalidatedAt:null}]};
  const leadership:MessagingLeadershipFacts={tribeId,leaderUserId:userId,membership:{userId,role:"leader",status:"active"}};
  const input={tribeId,requestId:randomUUID(),operationId,confirmed:true as const,providerId:"zavu" as const,name:"Conexión candidata",apiKey:randomUUID()};
  const result={state:"completed" as const,operationId,replayed:false,result:{id:randomUUID(),name:input.name,version:1,configurationVersion:1,state:"draft" as const,maskedCredential:"••••••••" as const}};
  const create=vi.fn(async()=>result),getAuthenticatedAccount=vi.fn(async()=>account),getCurrentLeadership=vi.fn(async()=>leadership);
  const useCase=new ManageMessagingConnectionsUseCases({getAuthenticatedAccount},{getCurrentLeadership},{create},()=>now);
  return{account,leadership,input,result,create,getAuthenticatedAccount,getCurrentLeadership,useCase};
}

describe("connection creation authority",()=>{
  it("should derive exact tribe recency from current native account facts and return only committed metadata",async()=>{
    const fixture=creationFixture();
    expect(await fixture.useCase.create(fixture.input)).toEqual({ok:true,value:fixture.result});
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({actorUserId:fixture.account.userId,sessionId:fixture.account.session.id,accountId:fixture.account.googleAccount!.id,subject:fixture.account.googleAccount!.subject,tribeId:fixture.input.tribeId,resourceId:fixture.input.tribeId,operation:"save_messaging_credentials"}),fixture.input);
    expect(JSON.stringify(fixture.result)).not.toContain(fixture.input.apiKey);
  });

  it.each(["guardian","muted","changed_leader"] as const)("should reject %s before the creation port can receive a credential",async(reason)=>{
    const fixture=creationFixture();
    if(reason==="guardian")fixture.leadership.membership!.role="guardian";
    if(reason==="muted")fixture.leadership.membership!.status="muted";
    if(reason==="changed_leader")fixture.leadership.leaderUserId=randomUUID();
    expect(await fixture.useCase.create(fixture.input)).toMatchObject({ok:false,failure:{code:"permission_denied"}});
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("should reject usage recency and invalidated creation recency rather than treating Google login as confirmation",async()=>{
    const fixture=creationFixture();
    fixture.account.recentAuthentication[0].operation="initialize_messaging_usage";
    expect(await fixture.useCase.create(fixture.input)).toMatchObject({ok:false,failure:{code:"reauthentication_required"}});
    fixture.account.recentAuthentication[0].operation="save_messaging_credentials";
    fixture.account.recentAuthentication[0].invalidatedAt=new Date("2026-10-07T12:00:00Z");
    expect(await fixture.useCase.create(fixture.input)).toMatchObject({ok:false,failure:{code:"reauthentication_required"}});
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("should prioritize a changed or expired current session after an awaited authority read",async()=>{
    const fixture=creationFixture();
    fixture.getCurrentLeadership.mockImplementationOnce(async()=>{fixture.account.session.expiresAt=new Date("2026-10-07T11:59:59Z");return fixture.leadership;});
    expect(await fixture.useCase.create(fixture.input)).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("should preserve only a proven registered operation on an uncertain commit and never retry creation",async()=>{
    const fixture=creationFixture();
    fixture.create.mockRejectedValueOnce(new MessagingConnectionOperationError("operation_unresolved",{operationId:fixture.input.operationId}));
    expect(await fixture.useCase.create(fixture.input)).toMatchObject({ok:false,failure:{code:"operation_unresolved",operation:{state:"started",operationId:fixture.input.operationId}}});
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
});
