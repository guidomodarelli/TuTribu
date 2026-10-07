/** @vitest-environment node */
/** Exercises manual resource confirmation with the real SDK before immutable configuration writes. @module configure-messaging-connection-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ConfigureMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/configure-messaging-connection-use-case";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConnectionConfigurationOperations} from "@/src/modules/messaging/domain/repositories/messaging-connection-configuration";
import {ZavuConnectionInspector} from "@/src/modules/messaging/infrastructure/zavu/zavu-connection-inspector";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";

/** @returns Actual SDK detail reads and controlled project-owned authority/storage ports. */
function configurationFixture(channel:"email"|"sms"|"whatsapp"="email"){
  const now=new Date(),connectionId=randomUUID(),senderId=randomUUID(),templateId=randomUUID(),credential=randomUUID();
  const context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"configure_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
  const events:string[]=[],input={tribeId:context.tribeId,connectionId,requestId:context.requestId,operationId:randomUUID(),expectedVersion:1,confirmed:true as const,channel,senderId,...(channel==="whatsapp"?{templateId,templateLanguage:"es"}:{})};
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:`/v1/senders/${senderId}`,method:"GET",respond:(request)=>{events.push("sender");expect(request.headers.get("Authorization")).toBe(`Bearer ${credential}`);return Response.json({id:senderId,name:"Remitente manual",channels:[channel],whatsapp:{paymentStatus:{canSendTemplates:true}},webhook:{secret:randomUUID()}});}},{origin:"https://api.zavu.dev",pathname:`/v1/templates/${templateId}`,method:"GET",respond:()=>{events.push("template");return Response.json({id:templateId,name:"Código",language:"es",category:"AUTHENTICATION",status:"approved",body:randomUUID()});}}]);
  const resolve=vi.fn(async()=>{events.push("authorize");return{allowed:true as const,context};});
  const prepare=vi.fn<MessagingConnectionConfigurationOperations["prepare"]>(async()=>{events.push("prepare");return{state:"prepared",configurationVersion:1,changed:true};});
  const commit=vi.fn<MessagingConnectionConfigurationOperations["commit"]>(async()=>{events.push("commit");return{state:"completed",operationId:input.operationId,replayed:false,result:{id:connectionId,name:"Conexión",version:2,configurationVersion:2,state:"draft",maskedCredential:"••••••••",changed:true}};});
  const loadAuthorizedSecret=vi.fn(async()=>{events.push("secret");return credential;});
  const useCase=new ConfigureMessagingConnectionUseCase({execute:resolve},{prepare,commit},{loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)});
  return{context,input,senderId,templateId,credential,transport,events,resolve,prepare,commit,loadAuthorizedSecret,useCase};
}

describe("immutable resource configuration",()=>{
  it.each(["email","sms","whatsapp"] as const)("should confirm exact manual %s resources before committing an untested new version without sending",async(channel)=>{
    const fixture=configurationFixture(channel),outcome=await fixture.useCase.execute(fixture.input,new AbortController().signal);
    expect(outcome).toMatchObject({ok:true,value:{state:"completed",result:{configurationVersion:2,changed:true}}});
    expect(fixture.events).toEqual(["authorize","prepare","secret","authorize","sender",...(channel==="whatsapp"?["authorize","template"]:[]),"authorize","commit"]);
    expect(fixture.commit).toHaveBeenCalledWith(fixture.context,fixture.input,expect.objectContaining({credential:fixture.credential,sender:expect.objectContaining({resourceId:fixture.senderId})}));
    expect(fixture.transport.receipts).toHaveLength(channel==="whatsapp"?2:1);expect(fixture.transport.receipts.every((receipt)=>receipt.method==="GET")).toBe(true);expect(JSON.stringify(outcome)).not.toContain(fixture.credential);
  });
  it("should replay an original result before loading credentials or consulting resources",async()=>{
    const fixture=configurationFixture(),original=await fixture.commit(fixture.context,fixture.input,{credential:"fixture",sender:{resourceId:fixture.senderId,name:"Remitente",channels:["email"],canSendWhatsappTemplates:false}});fixture.events.length=0;fixture.commit.mockClear();fixture.prepare.mockResolvedValueOnce({...original,...(original.state==="completed"?{replayed:true}:{})});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toEqual({ok:true,value:{...original,replayed:true}});expect(fixture.loadAuthorizedSecret).not.toHaveBeenCalled();expect(fixture.commit).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should preserve a current no-op without renewed capability evidence, a key read or provider RPC",async()=>{
    const fixture=configurationFixture();fixture.prepare.mockResolvedValueOnce({state:"prepared",configurationVersion:1,changed:false});
    await fixture.useCase.execute(fixture.input,new AbortController().signal);expect(fixture.commit).toHaveBeenCalledWith(fixture.context,fixture.input,null);expect(fixture.loadAuthorizedSecret).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should reject a crossed template language before committing any version",async()=>{
    const fixture=configurationFixture("whatsapp");
    expect(await fixture.useCase.execute({...fixture.input,templateLanguage:"en"},new AbortController().signal)).toMatchObject({ok:false,failure:{code:"missing_capability"}});expect(fixture.commit).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(2);
  });
  it("should stop a changed session after key recovery before querying the provider",async()=>{
    const fixture=configurationFixture();fixture.resolve.mockResolvedValueOnce({allowed:true,context:fixture.context}).mockResolvedValueOnce({allowed:true,context:{...fixture.context,sessionId:randomUUID()}});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:false,failure:{code:"authentication_required"}});expect(fixture.transport.receipts).toHaveLength(0);expect(fixture.commit).not.toHaveBeenCalled();
  });
});
