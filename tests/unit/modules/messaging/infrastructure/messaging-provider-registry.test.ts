/** @vitest-environment node */
/** Exercises explicit provider resolution at own boundaries without SDK or platform doubles. @module messaging-provider-registry-tests */
import {describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import type {AuthorizedMessagingContext,AuthorizedDeliveryMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {PreparedVerificationDelivery} from "@/src/modules/messaging/infrastructure/zavu/verification-delivery-preparation";
import {createAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {MessagingProviderRegistry} from "@/src/modules/messaging/infrastructure/messaging-provider-registry";
import {createZavuProviderDescriptor} from "@/src/modules/messaging/infrastructure/zavu/zavu-provider-descriptor";
import {RegisteredMessagingInspectorFactory,RegisteredMessagingDeliverySender} from "@/src/modules/messaging/infrastructure/registered-messaging-adapters";

describe("explicit messaging provider registry",()=>{
  it("should list only the implemented Zavu descriptor and close unknown providers without constructing an adapter",()=>{
    const fetch=vi.fn(),registry=new MessagingProviderRegistry([createZavuProviderDescriptor(fetch)]);
    expect(registry.list()).toEqual([{id:"zavu",channels:["email","sms","whatsapp"]}]);
    expect(()=>registry.resolve("unimplemented","email")).toThrow(expect.objectContaining({code:"missing_capability"}));expect(fetch).not.toHaveBeenCalled();
    expect(registry.resolve("zavu","email")).toMatchObject({id:"zavu",channels:["email","sms","whatsapp"]});
  });
  it("should preserve an injected email-only provider without inventing phone or substituting another adapter",()=>{
    const createInspector=vi.fn(),createSender=vi.fn(),descriptor={id:"synthetic-email",channels:["email"] as const,createInspector,createSender},registry=new MessagingProviderRegistry([descriptor]);
    expect(registry.resolve("synthetic-email","email")).toBe(descriptor);
    expect(()=>registry.resolve("synthetic-email","sms")).toThrow(expect.objectContaining({code:"missing_capability"}));
    expect(()=>registry.resolve("synthetic-email","whatsapp")).toThrow(expect.objectContaining({code:"missing_capability"}));expect(createInspector).not.toHaveBeenCalled();expect(createSender).not.toHaveBeenCalled();
  });
  it("should reject duplicate provider identities rather than silently overriding a registered adapter",()=>{
    const descriptor=createZavuProviderDescriptor(vi.fn());
    expect(()=>new MessagingProviderRegistry([descriptor,descriptor])).toThrow(expect.objectContaining({code:"connection_incomplete"}));
  });
  it("should create independent real SDK inspectors with the exact explicit credential and return only own facts",async()=>{
    const firstCredential=randomUUID(),secondCredential=randomUUID(),now=new Date(),context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId:randomUUID(),connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:randomUUID(),operation:"validate_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)},credentials:string[]=[];
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:(request)=>{credentials.push(request.headers.get("Authorization")??"");return Response.json({isTestMode:false,apiKey:{id:"synthetic-key"},project:{id:"synthetic-project"},team:{id:"synthetic-team"},unconsumed:{arbitrary:true}});}}]);
    const descriptor=new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]).resolve("zavu");
    const first=descriptor.createInspector(context,firstCredential),second=descriptor.createInspector(context,secondCredential);expect(first).not.toBe(second);
    const results=await Promise.all([first.inspectCredential(new AbortController().signal),second.inspectCredential(new AbortController().signal)]);
    expect(results).toEqual([{isTestMode:false,apiKeyId:"synthetic-key",projectId:"synthetic-project",teamId:"synthetic-team"},{isTestMode:false,apiKeyId:"synthetic-key",projectId:"synthetic-project",teamId:"synthetic-team"}]);
    expect(credentials).toEqual(expect.arrayContaining([`Bearer ${firstCredential}`,`Bearer ${secondCredential}`]));expect(transport.receipts).toHaveLength(2);
  });
  it("should resolve current own provider facts for every inspection and deny unknown identity before SDK transport",async()=>{
    const now=new Date(),connectionId=randomUUID(),context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"validate_messaging_connection",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)},credential=randomUUID();
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/me",method:"GET",respond:()=>Response.json({isTestMode:false,apiKey:{id:"synthetic-key"},project:{id:"synthetic-project"},team:{id:"synthetic-team"}})}]),readProvider=vi.fn(async()=>"zavu"),registry=new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]),inspector=new RegisteredMessagingInspectorFactory(registry,readProvider).create(context,credential);
    expect(await inspector.inspectCredential(new AbortController().signal)).toMatchObject({isTestMode:false});expect(readProvider).toHaveBeenCalledExactlyOnceWith(context);
    readProvider.mockResolvedValueOnce("unimplemented");await expect(inspector.inspectCredential(new AbortController().signal)).rejects.toMatchObject({code:"missing_capability"});expect(readProvider).toHaveBeenCalledTimes(2);expect(transport.receipts).toHaveLength(1);
  });
  it("should prepare the original attempt once and use the registered real SDK sender without fallback or another message",async()=>{
    const context:AuthorizedDeliveryMessagingContext={authorizationPurpose:"authorized_delivery",contributingLeaderUserId:randomUUID(),tribeId:randomUUID(),connectionId:randomUUID(),connectionVersion:1,environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),secretRef:randomUUID(),deliveryId:randomUUID(),attemptId:randomUUID(),attemptVersion:1,leaseToken:randomUUID(),sendAuthorizedAt:new Date(),authorizedUsagePolicyVersion:1,operation:"dispatch_delivery"};
    const prepared:PreparedVerificationDelivery={credential:randomUUID(),intent:{deliveryId:context.deliveryId,attemptId:context.attemptId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,environment:context.environment,securityEpoch:context.securityEpoch,channel:"email",senderId:randomUUID(),recipient:"synthetic@example.test",code:"429017",idempotencyKey:randomUUID(),templateId:null,templateLanguage:null}},prepare=vi.fn(async()=>prepared),readProvider=vi.fn(async()=>"zavu"),providerMessageId=randomUUID();
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:async(request)=>{const body=await request.json() as{fallbackEnabled:boolean;channel:string;idempotencyKey:string};expect(body).toMatchObject({fallbackEnabled:false,channel:"email",idempotencyKey:prepared.intent.idempotencyKey});expect(request.headers.get("Zavu-Sender")).toBe(prepared.intent.senderId);return Response.json({message:{id:providerMessageId,direction:"outbound",channel:"email",status:"sent"}});}}]);
    const sender=new RegisteredMessagingDeliverySender(new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]),readProvider,{prepare}),signal=new AbortController().signal;
    expect(await sender.send(context,signal)).toMatchObject({outcome:"accepted",providerMessageId});expect(prepare).toHaveBeenCalledExactlyOnceWith(context,signal);expect(readProvider).toHaveBeenCalledExactlyOnceWith(context);expect(transport.receipts).toHaveLength(1);
    readProvider.mockResolvedValueOnce("unimplemented");await expect(sender.send(context,signal)).rejects.toMatchObject({code:"missing_capability"});expect(transport.receipts).toHaveLength(1);
  });
});
