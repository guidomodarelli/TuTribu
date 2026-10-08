/** @vitest-environment node */
/** Exercises one server entrypoint for current connection metadata without provider queries or write effects. @module messaging-connections-page-tests */
import {randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {GetMessagingConnectionsPageUseCase} from "@/src/modules/messaging/application/use-cases/get-messaging-connections-page-use-case";
import type {MessagingAuthenticatedAccount} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";

/** @returns Current own account/query ports; no SDK, keyring, database or UI library is mocked. */
function pageFixture(){
  const now=new Date(),tribeId=randomUUID(),account:MessagingAuthenticatedAccount={userId:randomUUID(),session:{id:randomUUID(),expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:null,recentAuthentication:[]},configuration:MessagingConfigurationResult={audience:"leader",selected:null,candidate:null,usage:{state:"not_configured",policy:null}},read=vi.fn(async()=>({ok:true as const,value:configuration})),resolveTribe=vi.fn(async()=>({ok:true as const,value:{tribeId}})),accounts={getAuthenticatedAccount:vi.fn(async():Promise<MessagingAuthenticatedAccount|null>=>account)},query={slug:"synthetic",requestId:randomUUID()};
  return{now,tribeId,account,configuration,read,resolveTribe,accounts,query,useCase:new GetMessagingConnectionsPageUseCase(accounts,{configuration:{execute:read},resolveTribe:{execute:resolveTribe}},()=>now)};
}
describe("connection wizard server state",()=>{
  it("should load one current own configuration with deterministic metadata and no initial browser fetch",async()=>{
    const fixture=pageFixture();expect(await fixture.useCase.execute(fixture.query)).toEqual({ok:true,value:{kind:"ready",slug:"synthetic",tribeId:fixture.tribeId,viewerId:fixture.account.userId,renderedAt:fixture.now.toISOString(),configuration:fixture.configuration}});expect(fixture.read).toHaveBeenCalledExactlyOnceWith({tribeId:fixture.tribeId,requestId:fixture.query.requestId});
  });
  it("should retain only the minimal guardian operational alert instead of exposing a credential form model",async()=>{
    const fixture=pageFixture(),useCase=new GetMessagingConnectionsPageUseCase(fixture.accounts,{configuration:{execute:async()=>({ok:true as const,value:{audience:"guardian" as const,operationalAlert:"attention_required" as const}})},resolveTribe:{execute:fixture.resolveTribe}},()=>fixture.now);
    expect(await useCase.execute(fixture.query)).toMatchObject({ok:true,value:{configuration:{audience:"guardian",operationalAlert:"attention_required"}}});
  });
  it("should discard data if the session expires while the current configuration is being read",async()=>{
    const fixture=pageFixture();fixture.read.mockImplementationOnce(async()=>{fixture.account.session.expiresAt=new Date(fixture.now.getTime()-1);return{ok:true,value:fixture.configuration};});expect(await fixture.useCase.execute(fixture.query)).toMatchObject({ok:false,failure:{code:"authentication_required"}});
  });
});
