/** @vitest-environment node */
/** Exercises exact authority and complete resource pagination through the real SDK and closed owned HTTP. @module messaging-resource-listing-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {ReadMessagingResourcesUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-resources-use-case";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {ZavuConnectionInspector} from "@/src/modules/messaging/infrastructure/zavu/zavu-connection-inspector";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {MessagingSecretAccessError} from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** @returns Actual SDK pagination with only the project's authority/secret ports controlled. */
function resourceFixture(){
  const connectionId=randomUUID(),credential=randomUUID();
  const context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"read_messaging_senders"};
  const events:string[]=[],senderIds=[randomUUID(),randomUUID(),randomUUID()].sort(),privateSecret=randomUUID();
  const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/senders",method:"GET",respond:(request)=>{
    events.push("provider");expect(request.headers.get("Authorization")).toBe(`Bearer ${credential}`);
    const cursor=new URL(request.url).searchParams.get("cursor");
    return Response.json(cursor===null?{items:[],nextCursor:"provider-private-cursor"}:{items:senderIds.map((id)=>({id,name:"Remitente autorizado",channels:["email"],webhook:{secret:privateSecret}})),nextCursor:""});
  }}]);
  const resolve=vi.fn(async()=>{events.push("authorize");return{allowed:true as const,context};}),loadAuthorizedSecret=vi.fn(async()=>{events.push("secret");return credential;});
  const exposures:{connectionId:string;kind:string;itemCount:number}[]=[],exposure={record:async(scope:AuthorizedMessagingContext,extent:{kind:"senders"|"templates";itemCount:number})=>{events.push("exposure");exposures.push({connectionId:scope.connectionId,...extent});}};
  const useCase=new ReadMessagingResourcesUseCase({execute:resolve},{loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)},exposure);
  const input={tribeId:context.tribeId,connectionId,requestId:context.requestId,kind:"senders" as const,limit:2};
  return{context,credential,events,senderIds,privateSecret,transport,resolve,loadAuthorizedSecret,useCase,input,exposure,exposures};
}

describe("authorized messaging resources",()=>{
  it("should withhold the own page when its authorized-read fact cannot be confirmed",async()=>{
    const fixture=resourceFixture();
    fixture.exposure.record=async()=>{throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);};
    const result=await fixture.useCase.execute(fixture.input,new AbortController().signal);
    expect(result).toMatchObject({ok:false,failure:{code:"permission_denied"}});
    expect(result).not.toHaveProperty("value");expect(fixture.transport.receipts).toHaveLength(2);
  });
  it("should recheck the native session after the recorded read before publishing its data",async()=>{
    const fixture=resourceFixture();fixture.resolve.mockResolvedValueOnce({allowed:true,context:{...fixture.context}});
    fixture.exposure.record=async()=>{fixture.context.sessionId=randomUUID();};
    const result=await fixture.useCase.execute(fixture.input,new AbortController().signal);
    expect(result).toMatchObject({ok:false,failure:{code:"authentication_required"}});
    expect(result).not.toHaveProperty("value");expect(fixture.transport.receipts).toHaveLength(2);
  });
  it("should follow all provider pages then publish an own bounded page and exact configuration scope without private payloads",async()=>{
    const fixture=resourceFixture(),first=await fixture.useCase.execute(fixture.input,new AbortController().signal);
    expect(first).toMatchObject({ok:true,value:{connectionId:fixture.context.connectionId,configurationVersion:1,items:fixture.senderIds.slice(0,2).map((id)=>({id,label:"Remitente autorizado",channels:["email"],readiness:"ready"}))}});
    if(!first.ok||!first.value.nextCursor)throw new Error("Expected bounded own continuation");
    const encoded=JSON.stringify(first);expect(encoded).not.toContain(fixture.credential);expect(encoded).not.toContain(fixture.privateSecret);expect(encoded).not.toContain("provider-private-cursor");
    expect(fixture.events).toEqual(["authorize","secret","authorize","provider","provider","authorize","exposure","authorize"]);
    expect(fixture.exposures).toEqual([{connectionId:fixture.context.connectionId,kind:"senders",itemCount:2}]);
    const next=await fixture.useCase.execute({...fixture.input,cursor:JSON.parse(first.value.nextCursor)},new AbortController().signal);
    expect(next).toMatchObject({ok:true,value:{items:[{id:fixture.senderIds[2]}]}});if(next.ok)expect(next.value.nextCursor).toBeUndefined();
    expect(fixture.resolve).toHaveBeenCalledWith(expect.objectContaining({operation:"read_messaging_senders"}));
  });
  it("should reject foreign or changed configuration cursors before loading a credential or contacting the provider",async()=>{
    const fixture=resourceFixture();
    for(const cursor of[{tribeId:randomUUID(),connectionId:fixture.context.connectionId,configurationVersion:1,kind:"senders" as const,offset:2},{tribeId:fixture.context.tribeId,connectionId:fixture.context.connectionId,configurationVersion:2,kind:"senders" as const,offset:2}])expect(await fixture.useCase.execute({...fixture.input,cursor},new AbortController().signal)).toMatchObject({ok:false,failure:{code:"connection_conflict"}});
    expect(fixture.loadAuthorizedSecret).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should stop a changed native identity after secret loading without making a provider request",async()=>{
    const fixture=resourceFixture();fixture.resolve.mockResolvedValueOnce({allowed:true,context:fixture.context}).mockResolvedValueOnce({allowed:true,context:{...fixture.context,sessionId:randomUUID()}});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:false,failure:{code:"authentication_required"}});expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should discard successful provider metadata when current authorization is lost before returning the page",async()=>{
    const fixture=resourceFixture();fixture.resolve.mockResolvedValueOnce({allowed:true,context:fixture.context}).mockResolvedValueOnce({allowed:true,context:fixture.context}).mockResolvedValueOnce({allowed:true,context:{...fixture.context,connectionVersion:2}});
    expect(await fixture.useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:false,failure:{code:"connection_conflict"}});expect(fixture.transport.receipts).toHaveLength(2);
  });
  it("should return no partial page when a later provider page is inaccessible",async()=>{
    const fixture=resourceFixture(),transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/senders",method:"GET",respond:(request)=>new URL(request.url).searchParams.has("cursor")?Response.json({message:"private provider detail"},{status:403}):Response.json({items:[{id:randomUUID(),name:"Primera página",channels:["email"]}],nextCursor:"next-private"})}]);
    const useCase=new ReadMessagingResourcesUseCase({execute:fixture.resolve},{loadAuthorizedSecret:fixture.loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)},fixture.exposure);
    const outcome=await useCase.execute(fixture.input,new AbortController().signal);expect(outcome).toMatchObject({ok:false,failure:{code:"missing_capability"}});expect(transport.receipts).toHaveLength(2);if(!outcome.ok)expect(outcome).not.toHaveProperty("value");
  });
  it("should list template language and actual preparation without exposing body or issuing credential/send requests",async()=>{
    const fixture=resourceFixture(),templateId=randomUUID(),privateBody=randomUUID();fixture.context.operation="read_messaging_templates";
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/templates",method:"GET",respond:()=>Response.json({items:[{id:templateId,name:"Código",language:"es",category:"AUTHENTICATION",status:"approved",body:privateBody}],nextCursor:""})}]);
    const useCase=new ReadMessagingResourcesUseCase({execute:fixture.resolve},{loadAuthorizedSecret:fixture.loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)},fixture.exposure);
    const result=await useCase.execute({...fixture.input,kind:"templates"},new AbortController().signal);
    expect(result).toEqual({ok:true,value:{connectionId:fixture.context.connectionId,configurationVersion:1,items:[{id:templateId,label:"Código",channels:["whatsapp"],readiness:"ready",language:"es"}]}});
    expect(JSON.stringify(result)).not.toContain(privateBody);expect(transport.receipts).toHaveLength(1);expect(fixture.resolve).toHaveBeenCalledWith(expect.objectContaining({operation:"read_messaging_templates"}));
  });
  it("should stop an already cancelled request before any authority, secret or provider work",async()=>{
    const fixture=resourceFixture(),controller=new AbortController();controller.abort();
    expect(await fixture.useCase.execute(fixture.input,controller.signal)).toMatchObject({ok:false,failure:{code:"transport_timeout"}});expect(fixture.resolve).not.toHaveBeenCalled();expect(fixture.loadAuthorizedSecret).not.toHaveBeenCalled();expect(fixture.transport.receipts).toHaveLength(0);
  });
  it("should keep a WhatsApp-only sender incomplete when the provider cannot send templates",async()=>{
    const fixture=resourceFixture(),senderId=randomUUID(),transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/senders",method:"GET",respond:()=>Response.json({items:[{id:senderId,name:"WhatsApp pendiente",channels:["whatsapp"],whatsapp:{paymentStatus:{canSendTemplates:false}}}],nextCursor:""})}]);
    const useCase=new ReadMessagingResourcesUseCase({execute:fixture.resolve},{loadAuthorizedSecret:fixture.loadAuthorizedSecret},{create:(scope,key)=>new ZavuConnectionInspector({...scope,credential:key},transport.fetch)},fixture.exposure);
    expect(await useCase.execute(fixture.input,new AbortController().signal)).toMatchObject({ok:true,value:{items:[{id:senderId,channels:["whatsapp"],readiness:"incomplete"}]}});expect(transport.receipts).toHaveLength(1);
  });
});
