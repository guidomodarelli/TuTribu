/** @vitest-environment node */
/** Exercises one server entrypoint for current connection metadata without provider queries or write effects. @module messaging-connections-page-tests */
import {loadMessagingConnectionsPageState} from "@/src/modules/messaging/infrastructure/composition/messaging-connections-page";
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {GetMessagingConnectionsPageUseCase} from "@/src/modules/messaging/application/use-cases/get-messaging-connections-page-use-case";
import type {MessagingAuthenticatedAccount} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {messagingConnectionsPageStateSchema} from "@/src/modules/messaging/application/results/messaging-connections-page-state";

/** @returns Current own account/query ports; no SDK, keyring, database or UI library is mocked. */
function pageFixture(){
  const now=new Date(),tribeId=randomUUID(),account:MessagingAuthenticatedAccount={userId:randomUUID(),session:{id:randomUUID(),expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:null},configuration:MessagingConfigurationResult={audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}},read=vi.fn(async()=>({ok:true as const,value:configuration})),resolveTribe=vi.fn(async()=>({ok:true as const,value:{tribeId}})),accounts={getAuthenticatedAccount:vi.fn(async():Promise<MessagingAuthenticatedAccount|null>=>account)},query={slug:"synthetic",requestId:randomUUID()},providers={read:vi.fn(()=>[{id:"zavu",channels:["email","sms","whatsapp"]as const}])};
  return{now,tribeId,account,configuration,read,resolveTribe,accounts,query,providers,useCase:new GetMessagingConnectionsPageUseCase(accounts,{configuration:{execute:read},resolveTribe:{execute:resolveTribe},providers},()=>now)};
}
describe("connection wizard server state",()=>{
  it.each([{providerCatalog:[]},{providerCatalog:[{id:"zavu",channels:[]}]},{providerCatalog:[{id:"zavu",channels:["fax"]}]},{providerCatalog:[{id:"zavu",channels:["email","email"]}]},{providerCatalog:[{id:"zavu",channels:["email"]},{id:"zavu",channels:["sms"]}]}])("should reject an unusable own provider catalog before consuming ready props %#",({providerCatalog})=>{
    const fixture=pageFixture();
    expect(messagingConnectionsPageStateSchema.safeParse({kind:"ready",slug:"synthetic",tribeId:fixture.tribeId,viewerId:fixture.account.userId,renderedAt:fixture.now.toISOString(),configuration:fixture.configuration,providerCatalog}).success).toBe(false);
  });
  it("should reject private adapter fields without including their values in the safe failure",async()=>{
    const fixture=pageFixture(),privateMaterial=randomUUID(),providers={read:()=>[{id:"zavu",channels:["email"]as const,apiKey:privateMaterial}]};
    const readers={configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers};
    const outcome=await new GetMessagingConnectionsPageUseCase(fixture.accounts,readers,()=>fixture.now).execute(fixture.query);
    expect(outcome).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
    expect(JSON.stringify(outcome).includes(privateMaterial)).toBe(false);
  });
  it("should project only the implemented provider metadata into initial leader props without another query",async()=>{
    const fixture=pageFixture(),providers={read:vi.fn(()=>[{id:"zavu",channels:["email"]as const}])};
    const readers={configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers};
    const outcome=await new GetMessagingConnectionsPageUseCase(fixture.accounts,readers,()=>fixture.now).execute(fixture.query);
    expect(outcome).toMatchObject({ok:true,value:{providerCatalog:[{id:"zavu",channels:["email"]}]}});
    expect(providers.read).toHaveBeenCalledTimes(1);expect(fixture.read).toHaveBeenCalledTimes(1);expect(fixture.resolveTribe).toHaveBeenCalledTimes(1);
  });
  it("should close an unimplemented provider catalog before publishing leader props instead of falling back to Zavu",async()=>{
    const fixture=pageFixture(),providers={read:()=>[{id:"unimplemented",channels:["email"]as const}]};
    const readers={configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers};
    expect(await new GetMessagingConnectionsPageUseCase(fixture.accounts,readers,()=>fixture.now).execute(fixture.query)).toMatchObject({ok:false,failure:{code:"public_contract_unusable"}});
  });
  it("should omit provider metadata and avoid reading it for the minimal guardian audience",async()=>{
    const fixture=pageFixture(),providers={read:vi.fn(()=>[{id:"zavu",channels:["email"]as const}])};
    const readers={configuration:{execute:async()=>({ok:true as const,value:{audience:"guardian"as const,operationalAlert:"available"as const}})},resolveTribe:{execute:fixture.resolveTribe},providers};
    const outcome=await new GetMessagingConnectionsPageUseCase(fixture.accounts,readers,()=>fixture.now).execute(fixture.query);
    expect(outcome).toMatchObject({ok:true,value:{configuration:{audience:"guardian",operationalAlert:"available"}}});
    if(outcome.ok)expect(outcome.value).not.toHaveProperty("providerCatalog");expect(providers.read).not.toHaveBeenCalled();
  });
  it("should include one own notification page in initial leader props without an initial browser request",async()=>{
    const fixture=pageFixture(),catalog=vi.fn(async()=>({ok:true as const,value:{items:[],nextCursor:null}}));
    const useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers:fixture.providers,catalog:{execute:catalog}},()=>fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ok:true,value:{notificationCatalog:{status:"ready",value:{items:[],nextCursor:null}}}});
    expect(catalog).toHaveBeenCalledExactlyOnceWith({tribeId:fixture.tribeId,requestId:fixture.query.requestId,cursor:null});expect(fixture.read).toHaveBeenCalledTimes(1);
  });
  it("should omit the leader catalog entirely for a guardian",async()=>{
    const fixture=pageFixture(),catalog=vi.fn(async()=>({ok:true as const,value:{items:[],nextCursor:null}}));
    const useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:async()=>({ok:true as const,value:{audience:"guardian" as const,operationalAlert:"attention_required" as const}})},resolveTribe:{execute:fixture.resolveTribe},providers:fixture.providers,catalog:{execute:catalog}},()=>fixture.now);
    const outcome=await useCase.execute(fixture.query);expect(outcome.ok).toBe(true);if(outcome.ok)expect(outcome.value).not.toHaveProperty("notificationCatalog");expect(catalog).not.toHaveBeenCalled();
  });
  it("should keep a technical catalog failure safe and visible without serializing its private cause",async()=>{
    const fixture=pageFixture(),catalog={execute:async()=>({ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.dependencyUnavailable,{cause:new Error("Synthetic private catalog diagnostic")})})};
    const useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers:fixture.providers,catalog},()=>fixture.now);
    const outcome=await useCase.execute(fixture.query);expect(outcome).toMatchObject({ok:true,value:{notificationCatalog:{status:"failed",code:"dependency_unavailable"}}});expect(JSON.stringify(outcome)).not.toContain("Synthetic private catalog diagnostic");
  });
  it("should discard prior configuration when canonical leader authority fails during catalog loading",async()=>{
    const fixture=pageFixture(),catalog={execute:async()=>({ok:false as const,failure:messagingFailure(MESSAGING_ERROR_CODE.permissionDenied)})};
    const useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:fixture.read},resolveTribe:{execute:fixture.resolveTribe},providers:fixture.providers,catalog},()=>fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"permission_denied"}});
  });
  it("should load one current own configuration with deterministic metadata and no initial browser fetch",async()=>{
    const fixture=pageFixture();expect(await fixture.useCase.execute(fixture.query)).toEqual({ok:true,value:{kind:"ready",slug:"synthetic",tribeId:fixture.tribeId,viewerId:fixture.account.userId,renderedAt:fixture.now.toISOString(),configuration:fixture.configuration,providerCatalog:[{id:"zavu",channels:["email","sms","whatsapp"]}]}});expect(fixture.read).toHaveBeenCalledExactlyOnceWith({tribeId:fixture.tribeId,requestId:fixture.query.requestId});
  });
  it("should retain only the minimal guardian operational alert instead of exposing a credential form model",async()=>{
    const fixture=pageFixture(),useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:async()=>({ok:true as const,value:{audience:"guardian" as const,operationalAlert:"attention_required" as const}})},resolveTribe:{execute:fixture.resolveTribe},providers:fixture.providers},()=>fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ok:true,value:{configuration:{audience:"guardian",operationalAlert:"attention_required"}}});
  });
  it("should discard data if the session expires while the current configuration is being read",async()=>{
    const fixture=pageFixture();fixture.read.mockImplementationOnce(async()=>{fixture.account.session.expiresAt=new Date(fixture.now.getTime()-1);return{ok:true,value:fixture.configuration};});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"authentication_required"}});
  });
  it("should drop tracking query keys without reading them and still reject a malformed slug",async()=>{
    const open=vi.fn(async()=>{throw new Error("Synthetic composition stop");});
    expect(await loadMessagingConnectionsPageState({params:{slug:"Not A Slug!"},query:{}},open)).toMatchObject({kind:"unavailable",code:"invalid_input"});
    expect(open).not.toHaveBeenCalled();
    // The tracking key passes the boundary and the loader reaches composition, which this test stops on purpose.
    expect(await loadMessagingConnectionsPageState({params:{slug:"synthetic-academy"},query:{utm_source:"mail",fbclid:"x"}},open)).not.toMatchObject({code:"invalid_input"});
    expect(open).toHaveBeenCalledOnce();
  });
});
