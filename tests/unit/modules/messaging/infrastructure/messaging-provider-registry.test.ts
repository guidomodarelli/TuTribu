/** @vitest-environment node */
/** Exercises explicit provider resolution at own boundaries without SDK or platform doubles. @module messaging-provider-registry-tests */
import {describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import type {AuthorizedMessagingContext,AuthorizedDeliveryMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {PreparedVerificationDelivery} from "@/src/modules/messaging/infrastructure/verification-delivery-preparation";
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
  it("should keep public catalog mutation separate from registered identity and actual channel authority",()=>{
    // Given metadata exposed to a JavaScript consumer, with no inspector or sender construction.
    const createInspector=vi.fn(),createSender=vi.fn();
    const descriptor={id:"synthetic-email",channels:["email"] as const,createInspector,createSender};
    const registry=new MessagingProviderRegistry([descriptor]),catalog=registry.list();
    expect(catalog).toEqual([{id:"synthetic-email",channels:["email"]}]);

    // When a consumer changes its own returned object and channel array at runtime.
    expect(Reflect.set(catalog[0],"id","zavu")).toBe(true);
    expect(Reflect.set(catalog[0].channels,1,"sms")).toBe(true);
    expect(catalog).toEqual([{id:"zavu",channels:["email","sms"]}]);

    // Then fresh metadata and real resolution retain only the original email implementation.
    expect(registry.list()).toEqual([{id:"synthetic-email",channels:["email"]}]);
    expect(registry.resolve("synthetic-email","email")).toBe(descriptor);
    expect(()=>registry.resolve("synthetic-email","sms")).toThrow(expect.objectContaining({code:"missing_capability"}));
    expect(()=>registry.resolve("zavu","email")).toThrow(expect.objectContaining({code:"missing_capability"}));
    expect(createInspector).not.toHaveBeenCalled();expect(createSender).not.toHaveBeenCalled();
  });
  it.each(["","__proto__","constructor","toString"])("should deny an unregistered runtime identity %j without constructing a default adapter",(providerId)=>{
    const createInspector=vi.fn(),createSender=vi.fn();
    const registry=new MessagingProviderRegistry([{id:"synthetic-email",channels:["email"],createInspector,createSender}]);
    expect(()=>registry.resolve(providerId,"email")).toThrow(expect.objectContaining({code:"missing_capability"}));
    expect(createInspector).not.toHaveBeenCalled();expect(createSender).not.toHaveBeenCalled();
  });
  it.each(["fax","",null,false,0])("should deny an unsupported runtime channel %j before constructing the registered real SDK adapter",(channel)=>{
    // JavaScript callers can supply values outside TypeScript's compile-time channel union.
    const fetch=vi.fn(),registry=new MessagingProviderRegistry([createZavuProviderDescriptor(fetch)]);
    expect(()=>Reflect.apply(registry.resolve,registry,["zavu",channel])).toThrow(expect.objectContaining({code:"missing_capability"}));
    expect(fetch).not.toHaveBeenCalled();
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
  it("should preserve actual Zavu template list and detail when registered template inspection has its own factory",async()=>{
    // Given the real SDK behind only the own closed HTTP boundary.
    const now=new Date(),connectionId=randomUUID(),templateId=randomUUID(),credential=randomUUID();
    const context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"read_messaging_templates",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
    const template={id:templateId,name:"otp",language:"es",category:"AUTHENTICATION",status:"approved"};
    const transport=createAdmissionProviderTransport([
      {origin:"https://api.zavu.dev",pathname:"/v1/templates",method:"GET",respond:(request)=>{expect(request.headers.get("Authorization")===`Bearer ${credential}`).toBe(true);return Response.json({items:[template],nextCursor:null});}},
      {origin:"https://api.zavu.dev",pathname:`/v1/templates/${templateId}`,method:"GET",respond:()=>Response.json(template)},
    ]);
    const inspector=new RegisteredMessagingInspectorFactory(new MessagingProviderRegistry([createZavuProviderDescriptor(transport.fetch)]),async()=>"zavu").create(context,credential),signal=new AbortController().signal;

    // When the application resolves the additional supported capability for each operation.
    const listed=await inspector.listTemplates(signal),retrieved=await inspector.retrieveTemplate(templateId,signal);

    // Then both real SDK operations retain the same minimal own result and exact transport scope.
    expect(listed).toEqual([{resourceId:templateId,name:"otp",language:"es",authenticationApproved:true}]);
    expect(retrieved).toEqual(listed[0]);expect(transport.receipts).toHaveLength(2);
  });
  it("should deny a declared template channel without its actual template factory before entering SDK transport",async()=>{
    // A broken infrastructure descriptor must fail with the own capability error, never a TypeError or a fallback.
    const now=new Date(),connectionId=randomUUID(),fetch=vi.fn(),descriptor=createZavuProviderDescriptor(fetch);
    delete descriptor.createTemplateInspector;
    const context:AuthorizedMessagingContext={authorizationPurpose:"sensitive_leader",actorUserId:randomUUID(),sessionId:randomUUID(),accountId:randomUUID(),subject:randomUUID(),tribeId:randomUUID(),connectionId,connectionVersion:1,secretRef:randomUUID(),environment:"synthetic",securityEpoch:"synthetic-epoch",requestId:randomUUID(),resourceId:connectionId,operation:"read_messaging_templates",authenticatedAt:now,validUntil:new Date(now.getTime()+540_000)};
    const inspector=new RegisteredMessagingInspectorFactory(new MessagingProviderRegistry([descriptor]),async()=>"zavu").create(context,randomUUID()),signal=new AbortController().signal;
    await expect(inspector.listTemplates(signal)).rejects.toMatchObject({code:"missing_capability"});
    await expect(inspector.retrieveTemplate(randomUUID(),signal)).rejects.toMatchObject({code:"missing_capability"});expect(fetch).not.toHaveBeenCalled();
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
