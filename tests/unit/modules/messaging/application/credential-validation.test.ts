/** @vitest-environment node */
/** Exercises staged validation through the actual SDK and an owned closed HTTP boundary. @module credential-validation-tests */
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { ValidateMessagingConnectionUseCase } from "@/src/modules/messaging/application/use-cases/validate-messaging-connection-use-case";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { ZavuConnectionInspector } from "@/src/modules/messaging/infrastructure/zavu/zavu-connection-inspector";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import type { CredentialValidationBudget } from "@/src/modules/messaging/domain/repositories/credential-validation-budget";
import type { MessagingCredentialValidationOperations } from "@/src/modules/messaging/domain/repositories/messaging-credential-validation";

/** @returns Private current scope and a real-SDK validation workflow with only owned stage/budget/storage ports replaced. */
function validationFixture(status=200){
  const now=new Date(),context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId:randomUUID(),connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:"",operation:"validate_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
  context.resourceId=context.connectionId;
  const input={tribeId:context.tribeId,connectionId:context.connectionId,requestId:context.requestId,operationId:randomUUID(),expectedVersion:1,confirmed:true as const},validationId=randomUUID(),credential=randomUUID(),events:string[]=[];
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:(request)=>{events.push("provider");expect(request.headers.get("Authorization")).toBe(`Bearer ${credential}`);return status===200?Response.json({isTestMode:true,apiKey:{id:randomUUID()},project:{id:randomUUID()},team:{id:randomUUID()},ignored:{arbitrary:true}}):Response.json({message:"private provider failure"},{status});}}]);
  const resolve=vi.fn(async()=>{events.push("authorize");return{allowed:true as const,context};});
  const prepare=vi.fn(async()=>{events.push("prepare");return{state:"prepared" as const,validationId,configurationVersion:1};}),read=vi.fn(async()=>null);
  const complete=vi.fn<MessagingCredentialValidationOperations["complete"]>(async(_context,_input,_validationId,outcome)=>{events.push("complete");return{state:"completed"as const,operationId:input.operationId,replayed:false,result:{id:context.connectionId,version:2,configurationVersion:1,credentialState:outcome.ok?"valid"as const:"invalid"as const,credentialMode:outcome.ok?"test"as const:"unknown"as const,validatedAt:now.toISOString()}};});
  const reserve=vi.fn<CredentialValidationBudget["reserve"]>(async()=>{events.push("budget");return{outcome:"reserved"as const,operationId:validationId,reservedAt:now};});
  const loadAuthorizedSecret=vi.fn(async()=>{events.push("secret");return credential;});
  const useCase=new ValidateMessagingConnectionUseCase({execute:resolve},{prepare,read,complete},{execute:reserve},{loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)});
  return{context,input,validationId,credential,events,transport,resolve,prepare,read,complete,reserve,loadAuthorizedSecret,useCase};
}

describe("staged credential validation",()=>{
  it("should authorize and commit accounting before one SDK read, then persist only consumed facts",async()=>{
    const fixture=validationFixture(),result=await fixture.useCase.execute(fixture.input,new AbortController().signal);
    expect(result).toMatchObject({ok:true,value:{state:"completed",result:{credentialState:"valid",credentialMode:"test",configurationVersion:1}}});
    expect(fixture.events).toEqual(["authorize","prepare","budget","secret","authorize","provider","complete"]);
    expect(fixture.reserve).toHaveBeenCalledExactlyOnceWith({context:fixture.context,operationId:fixture.validationId});
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith(fixture.context,fixture.input,fixture.validationId,{ok:true,inspection:expect.objectContaining({isTestMode:true})});
    expect(JSON.stringify(result)).not.toContain(fixture.credential);
    expect(fixture.transport.receipts).toHaveLength(1);
  });
  it("should return genuine progress after an already consumed allowance without loading a key or repeating RPC",async()=>{
    const fixture=validationFixture();fixture.reserve.mockResolvedValueOnce({outcome:"already_reserved",operationId:fixture.validationId,reservedAt:new Date()});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:true,value:{state:"started",operationId:fixture.input.operationId}});
    expect(fixture.loadAuthorizedSecret).not.toHaveBeenCalled();expect(fixture.complete).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should persist an adapter-classified invalid credential without provider text, channel preparation or retry",async()=>{
    const fixture=validationFixture(401);
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:true,value:{state:"completed",result:{credentialState:"invalid"}}});
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith(fixture.context,fixture.input,fixture.validationId,{ok:false,code:"invalid_credentials"});
    expect(fixture.transport.receipts).toHaveLength(1);
  });
  it("should close a changed scope after key loading before the SDK can use it",async()=>{
    const fixture=validationFixture();fixture.resolve.mockResolvedValueOnce({allowed:true,context:fixture.context}).mockResolvedValueOnce({allowed:true,context:{...fixture.context,sessionId:randomUUID()}});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(fixture.transport.receipts).toHaveLength(0);expect(fixture.complete).not.toHaveBeenCalled();
  });
});
