/** @vitest-environment node */

/** Exercises one-use global nonce consumption and signed recency on the owned SQL branch. */
import {randomUUID} from "node:crypto";
import {google} from "better-auth/social-providers";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {createAdmissionGoogleTokenFixture} from "@/tests/support/admission-google-tokens";
import {createAdmissionProviderTransport,withAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {verifyGoogleIdTokenEvidence} from "@/src/modules/auth/infrastructure/better-auth/google-id-token-evidence-verifier";
import {PostgresRecentAuthenticationRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-recent-authentication-repository";

/** Seeds real global sessions and canonical leadership without any external login. */
async function prepareRecentAuthentication(database:AcademyAdmissionTestDatabase) {
  await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
  const userId=randomUUID();const accountId=randomUUID();const subject=randomUUID();const originalSessionId=randomUUID();const sessionId=randomUUID();const tribeId=randomUUID();
  const email=`${userId}@gmail.com`;const own={userId,email};const returnPath=`/${tribeId}/settings`;const operation="save_messaging_credentials";
  await database.withContext(own,async(transaction)=>{
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic recent identity',${email},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    for(const identitySessionId of [originalSessionId,sessionId]) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${identitySessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic recent tribe',${`recent-${tribeId}`},${userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${userId},'leader','active')`);
  });
  const repository=new PostgresRecentAuthenticationRepository((run)=>database.withContext(own,run),(transaction)=>({
    resolve:async(scope)=>{
      if(scope.operation!==operation) return null;
      const resource=(await transaction.execute(sql`select id from public.tribes where id=${scope.tribeId} and id=${scope.resourceId} for share`)).rows[0];
      return resource?{allowedReturnPaths:[returnPath]}:null;
    },
  }));
  return {userId,accountId,subject,originalSessionId,sessionId,tribeId,email,own,returnPath,operation,repository,scope:{userId,accountId,subject,sessionId:originalSessionId,tribeId,operation,resourceId:tribeId}};
}

/** Uses the native verifier so nonce and auth_time originate in one real signed token. */
async function signedCallback(fixture:Awaited<ReturnType<typeof prepareRecentAuthentication>>,nonce:string,authTime:number|undefined) {
  const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const instant=Math.floor(Date.now()/1000);
  const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:fixture.subject,iat:instant,exp:instant+3600,email:fixture.email,email_verified:true,nonce,auth_time:authTime});
  const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
  const result=await withAdmissionProviderTransport(transport,()=>verifyGoogleIdTokenEvidence(token,google({clientId,clientSecret:randomUUID()})));
  if(result.status!=="verified") throw new Error("Synthetic recent token verification failed");
  return {userId:fixture.userId,accountId:fixture.accountId,sessionId:fixture.sessionId,evidence:result.evidence};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("recent authentication writer",()=>{
  it("should consume the issued nonce once and emit signed recency in the same commit",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      expect(created).toMatchObject({status:"created",intent:{version:1,status:"created"}});
      if(created.status!=="created") throw new Error("Synthetic intent creation failed");
      const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
      expect(issued).toMatchObject({status:"authorizing"});
      if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
      const callback=await signedCallback(fixture,issued.nonce,Math.floor(Date.now()/1000));
      const outcome=await fixture.repository.complete({...callback,intentId:created.intent.id});
      expect(outcome).toMatchObject({status:"consumed",evidence:{sessionId:fixture.sessionId,accountId:fixture.accountId,subject:fixture.subject,tribeId:fixture.tribeId,operation:fixture.operation,resourceId:fixture.tribeId}});
      expect(await fixture.repository.complete({...callback,intentId:created.intent.id})).toEqual({status:"intent_unusable"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state,version from public.global_reauthentication_intents where id=${created.intent.id}`)).rows)).toEqual([{state:"consumed",version:3}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as total from public.recent_authentication_evidence where intent_id=${created.intent.id}`)).rows)).toEqual([{total:1}]);
    });
  },120_000);

  it("should reject a crossed nonce and lost leadership without consuming the intent",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      if(created.status!=="created") throw new Error("Synthetic intent creation failed");
      const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
      if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
      const crossed=await signedCallback(fixture,randomUUID(),Math.floor(Date.now()/1000));
      expect(await fixture.repository.complete({...crossed,intentId:created.intent.id})).toEqual({status:"intent_unusable"});
      const matching=await signedCallback(fixture,issued.nonce,Math.floor(Date.now()/1000));
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      expect(await fixture.repository.complete({...matching,intentId:created.intent.id})).toEqual({status:"context_unavailable"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state,version from public.global_reauthentication_intents where id=${created.intent.id}`)).rows)).toEqual([{state:"authorizing",version:2}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.recent_authentication_evidence where intent_id=${created.intent.id}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should allow only one concurrent callback to emit recency",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      if(created.status!=="created") throw new Error("Synthetic intent creation failed");
      const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
      if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
      const callback=await signedCallback(fixture,issued.nonce,Math.floor(Date.now()/1000));
      const outcomes=await Promise.all([fixture.repository.complete({...callback,intentId:created.intent.id}),fixture.repository.complete({...callback,intentId:created.intent.id})]);
      expect(outcomes.filter((outcome)=>outcome.status==="consumed")).toHaveLength(1);
      expect(outcomes.filter((outcome)=>outcome.status==="intent_unusable")).toHaveLength(1);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as total from public.recent_authentication_evidence where intent_id=${created.intent.id}`)).rows)).toEqual([{total:1}]);
    });
  },120_000);

  it("should consume a legitimate callback without minting recency from missing or stale auth_time",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      for(const authTime of [undefined,Math.floor(Date.now()/1000)-601]) {
        const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
        if(created.status!=="created") throw new Error("Synthetic intent creation failed");
        const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
        if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
        const callback=await signedCallback(fixture,issued.nonce,authTime);
        expect(await fixture.repository.complete({...callback,intentId:created.intent.id})).toEqual({status:"consumed",evidence:null});
        expect(await fixture.repository.complete({...callback,intentId:created.intent.id})).toEqual({status:"intent_unusable"});
      }
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.recent_authentication_evidence where user_id=${fixture.userId}`)).rows)).toEqual([]);
    });
  },120_000);
});
