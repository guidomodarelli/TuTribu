/** Exercises intent orchestration through owned account and persistence ports. */
import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {CreateReauthenticationIntentUseCase,ReadReauthenticationIntentUseCase,BeginGlobalReauthenticationUseCase} from "@/src/modules/auth/application/use-cases/recent-authentication-use-cases";
import type {AuthenticatedAccount} from "@/src/modules/auth/domain/entities/authenticated-account";
import type {GlobalReauthenticationIntent} from "@/src/modules/auth/domain/entities/global-reauthentication-intent";
import type {RecentAuthenticationRepository} from "@/src/modules/auth/domain/repositories/recent-authentication-repository";

/** Keeps current identity and requested sensitive action distinct from client-supplied permissions. */
function scenario() {
  const now=new Date();const userId=randomUUID();const accountId=randomUUID();const subject=randomUUID();const sessionId=randomUUID();const tribeId=randomUUID();
  const account:AuthenticatedAccount={userId,normalizedEmail:`${userId}@gmail.com`,session:{id:sessionId,expiresAt:new Date(now.getTime()+3_600_000)},googleAccount:{id:accountId,subject},identityEvidence:null,recentAuthentication:[]};
  const intent:GlobalReauthenticationIntent={id:randomUUID(),userId,accountId,subject,originalSessionId:sessionId,tribeId,operation:"save_messaging_credentials",resourceId:tribeId,returnPath:`/${tribeId}`,nonceHash:null,status:"created",version:1,createdAt:now,expiresAt:new Date(now.getTime()+600_000),consumedAt:null};
  const command={tribeId,operation:"save_messaging_credentials",resourceId:tribeId,returnPath:intent.returnPath};
  const calls:unknown[]=[];
  const repository:RecentAuthenticationRepository={create:async(input)=>{calls.push(input);return {status:"created",intent};},issueNonce:async()=>({status:"intent_unusable"}),complete:async()=>({status:"intent_unusable"}),read:async()=>intent};
  return {now,account,intent,command,calls,repository};
}

describe("reauthentication intent use cases",()=>{
  it("should issue a nonce only from the current account and the owned stored intent",async()=>{
    const fixture=scenario();const issued:unknown[]=[];
    fixture.repository.issueNonce=async(command)=>{issued.push(command);return {status:"authorizing",nonce:"synthetic-owned-nonce"};};
    const useCase=new BeginGlobalReauthenticationUseCase({getAuthenticatedAccount:async()=>fixture.account},fixture.repository);
    expect(await useCase.execute({intentId:fixture.intent.id})).toEqual({allowed:true,nonce:"synthetic-owned-nonce"});
    expect(issued).toEqual([{userId:fixture.account.userId,accountId:fixture.account.googleAccount?.id,subject:fixture.account.googleAccount?.subject,sessionId:fixture.account.session.id,tribeId:fixture.intent.tribeId,operation:fixture.intent.operation,resourceId:fixture.intent.resourceId,intentId:fixture.intent.id}]);
    fixture.repository.read=async()=>null;
    expect(await useCase.execute({intentId:fixture.intent.id})).toEqual({allowed:false});
    expect(issued).toHaveLength(1);
  });

  it("should create only from the current server account and return a safe public projection",async()=>{
    const fixture=scenario();
    const useCase=new CreateReauthenticationIntentUseCase({getAuthenticatedAccount:async()=>fixture.account},fixture.repository);
    const result=await useCase.execute(fixture.command);
    expect(fixture.calls).toEqual([{...fixture.command,userId:fixture.account.userId,sessionId:fixture.account.session.id,accountId:fixture.account.googleAccount?.id,subject:fixture.account.googleAccount?.subject}]);
    expect(result).toMatchObject({ok:true,value:{intentId:fixture.intent.id,state:"created",outcome:"pending",returnPath:fixture.intent.returnPath}});
    expect(JSON.stringify(result)).not.toContain(fixture.account.googleAccount?.subject);
    expect(JSON.stringify(result)).not.toContain("nonceHash");
  });

  it.each(["anonymous","missing_account"] as const)("should keep %s before the writer without inventing account authority",async(kind)=>{
    const fixture=scenario();const account=kind==="anonymous"?null:{...fixture.account,googleAccount:null};
    const useCase=new CreateReauthenticationIntentUseCase({getAuthenticatedAccount:async()=>account},fixture.repository);
    expect(await useCase.execute(fixture.command)).toMatchObject({ok:false,failure:{code:kind==="anonymous"?"not_authenticated":"reauthentication_required"}});
    expect(fixture.calls).toEqual([]);
  });

  it("should not describe a consumed intent without signed recency as verified",async()=>{
    const fixture=scenario();fixture.intent.status="consumed";fixture.intent.nonceHash=new Uint8Array(32);fixture.intent.consumedAt=fixture.now;
    const useCase=new ReadReauthenticationIntentUseCase({getAuthenticatedAccount:async()=>fixture.account},fixture.repository,()=>fixture.now);
    expect(await useCase.execute({intentId:fixture.intent.id})).toMatchObject({ok:true,value:{state:"consumed",outcome:"reauthentication_required"}});
  });

  it("should show only current session and exact operation recency",async()=>{
    const fixture=scenario();fixture.intent.status="consumed";fixture.intent.nonceHash=new Uint8Array(32);fixture.intent.consumedAt=fixture.now;
    fixture.account.recentAuthentication=[{id:randomUUID(),intentId:fixture.intent.id,userId:fixture.account.userId,accountId:fixture.account.googleAccount!.id,subject:fixture.account.googleAccount!.subject,sessionId:fixture.account.session.id,tribeId:fixture.intent.tribeId,operation:fixture.intent.operation,resourceId:fixture.intent.resourceId,authenticatedAt:new Date(fixture.now.getTime()-1000),verifiedAt:fixture.now,validUntil:new Date(fixture.now.getTime()+599_000),invalidatedAt:null}];
    const useCase=new ReadReauthenticationIntentUseCase({getAuthenticatedAccount:async()=>fixture.account},fixture.repository,()=>fixture.now);
    expect(await useCase.execute({intentId:fixture.intent.id})).toMatchObject({ok:true,value:{outcome:"verified"}});
    fixture.account.recentAuthentication=[{...fixture.account.recentAuthentication[0],sessionId:randomUUID()}];
    expect(await useCase.execute({intentId:fixture.intent.id})).toMatchObject({ok:true,value:{outcome:"reauthentication_required"}});
  });
});
