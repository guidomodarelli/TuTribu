/** @vitest-environment node */
/** Exercises original connection recovery for the forthcoming wizard without retaining a key or repeating writes. @module read-messaging-connection-operation-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ReadMessagingConnectionOperationUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-connection-operation-use-case";
import type {MessagingAuthenticatedAccount,MessagingLeadershipFacts} from "@/src/modules/messaging/domain/repositories/messaging-repositories";

/** @returns Current own account/authorization/readonly ports; no SDK, database or framework is mocked. */
function recoveryFixture(){
  const now=new Date(),userId=randomUUID(),tribeId=randomUUID(),operationId=randomUUID(),sessionId=randomUUID(),account:MessagingAuthenticatedAccount={userId,session:{id:sessionId,expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:null,recentAuthentication:[]},leadership:MessagingLeadershipFacts={tribeId,leaderUserId:userId,membership:{userId,role:"leader",status:"active"}};
  const result={type:"save_messaging_credentials",state:"completed",operationId,replayed:true,result:{id:randomUUID(),name:"Conexión",version:1,configurationVersion:1,state:"draft",maskedCredential:"••••••••"}},read=vi.fn(async():Promise<unknown|null>=>result),accounts={getAuthenticatedAccount:vi.fn(async():Promise<MessagingAuthenticatedAccount|null>=>account)},authorization={getCurrentLeadership:vi.fn(async():Promise<MessagingLeadershipFacts|null>=>leadership)},query={tribeId,operationId,requestId:randomUUID()};
  return{now,account,leadership,accounts,authorization,read,result,query,useCase:new ReadMessagingConnectionOperationUseCase(accounts,authorization,{read},()=>now)};
}
describe("original connection operation recovery",()=>{
  it("should recover a created connection without key input or mutation recency and preserve its original metadata",async()=>{
    const fixture=recoveryFixture();expect(await fixture.useCase.execute(fixture.query)).toEqual({ok:true,value:fixture.result});
    expect(fixture.read).toHaveBeenCalledExactlyOnceWith({actorUserId:fixture.account.userId,sessionId:fixture.account.session.id,tribeId:fixture.query.tribeId,requestId:fixture.query.requestId},fixture.query.operationId);
  });
  it("should reject another operation UUID or private credential fields instead of publishing them",async()=>{
    const fixture=recoveryFixture();fixture.read.mockResolvedValueOnce({...fixture.result,operationId:randomUUID()});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
    fixture.read.mockResolvedValueOnce({...fixture.result,result:{...fixture.result.result,apiKey:randomUUID()}});const outcome=await fixture.useCase.execute(fixture.query);expect(outcome).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
    fixture.read.mockResolvedValueOnce({...fixture.result,result:{...fixture.result.result,version:4,state:"active"}});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
  });
  it("should close a recovered result when current leadership was revoked during its read",async()=>{
    const fixture=recoveryFixture();fixture.read.mockImplementationOnce(async()=>{fixture.leadership.membership!.role="guardian";return fixture.result;});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"permission_denied"}});
  });
  it.each(["validate_messaging_connection","configure_messaging_connection","diagnose_messaging_connection","verify_messaging_diagnostic","activate_messaging_connection"] as const)("should guard the original %s result under its own namespace",async(type)=>{
    const fixture=recoveryFixture(),base=fixture.result.result;
    const result=type==="validate_messaging_connection"?{id:base.id,version:2,configurationVersion:1,credentialState:"valid",credentialMode:"production",validatedAt:fixture.now.toISOString()}:type==="configure_messaging_connection"?{...base,version:2,configurationVersion:2,changed:true}:type==="activate_messaging_connection"?{...base,version:2,state:"active",replaced:null,policyVersion:null}:{outcome:"denied",code:"recipient_not_allowed"};
    fixture.read.mockResolvedValueOnce({type,state:"completed",operationId:fixture.query.operationId,replayed:true,result});
    expect(await fixture.useCase.execute(fixture.query)).toEqual({ok:true,value:{type,state:"completed",operationId:fixture.query.operationId,replayed:true,result}});
  });
  it("should expose only a genuinely registered started operation and deny absent or unimplemented namespaces",async()=>{
    const fixture=recoveryFixture();fixture.read.mockResolvedValueOnce({type:"save_messaging_credentials",state:"started",operationId:fixture.query.operationId,replayed:true});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:true,value:{state:"started"}});
    fixture.read.mockResolvedValueOnce(null);expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"resource_unavailable"}});
    fixture.read.mockResolvedValueOnce({...fixture.result,type:"initialize_messaging_usage"});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
  });
});
