/** @vitest-environment node */

/** Exercises current identity binding through the real guarded PostgreSQL boundary. */
import {randomUUID} from "node:crypto";
import {google} from "better-auth/social-providers";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase,type AcademyAdmissionTestDatabase} from "@/tests/support/academy-admission-database";
import {createAdmissionGoogleTokenFixture} from "@/tests/support/admission-google-tokens";
import {createAdmissionProviderTransport,withAdmissionProviderTransport} from "@/tests/support/admission-provider-transport";
import {verifyGoogleIdTokenEvidence} from "@/src/modules/auth/infrastructure/better-auth/google-id-token-evidence-verifier";
import {PostgresGlobalIdentityEvidenceRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-global-identity-evidence-repository";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";

/** Creates only synthetic global auth records on the owned branch. */
async function prepareIdentity(database:AcademyAdmissionTestDatabase) {
  await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
  await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  const userId=randomUUID();const otherUserId=randomUUID();const accountId=randomUUID();const sessionId=randomUUID();const subject=randomUUID();
  const email=`${userId}@gmail.com`;const own={userId,email};
  await database.withContext(own,async(transaction)=>{
    for(const accountUserId of [userId,otherUserId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${accountUserId},'Synthetic identity account',${accountUserId===userId?email:`${accountUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
  });
  const signer=await createAdmissionGoogleTokenFixture();const clientId=randomUUID();const instant=Math.floor(Date.now()/1000);
  const token=await signer.sign({iss:"https://accounts.google.com",aud:clientId,sub:subject,iat:instant,exp:instant+3600,email,email_verified:true});
  const transport=createAdmissionProviderTransport([{origin:"https://www.googleapis.com",pathname:"/oauth2/v3/certs",method:"GET",respond:()=>Response.json(signer.jwks)}]);
  const verified=await withAdmissionProviderTransport(transport,()=>verifyGoogleIdTokenEvidence(token,google({clientId,clientSecret:randomUUID()})));
  if(verified.status!=="verified") throw new Error("Synthetic identity verification failed");
  const command={userId,accountId,sessionId,evidence:verified.evidence};
  const repository=new PostgresGlobalIdentityEvidenceRepository((callback)=>database.withContext(own,callback));
  return {userId,otherUserId,accountId,sessionId,subject,email,own,command,repository};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("global identity evidence repository",()=>{
  it("should project current signed account facts without provider tokens or a tribe role",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      expect(await fixture.repository.capture(fixture.command)).toMatchObject({status:"stored"});
      const provider=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId:fixture.sessionId}),(identity,run)=>database.withContext({userId:identity.userId,email:null},run));
      const account=await provider.getAuthenticatedAccount();
      expect(account).toMatchObject({userId:fixture.userId,normalizedEmail:fixture.email,session:{id:fixture.sessionId},googleAccount:{id:fixture.accountId,subject:fixture.subject},identityEvidence:{classification:"gmail",accountId:fixture.accountId,subject:fixture.subject},recentAuthentication:[]});
      for(const privateField of ["token","idToken","accessToken","refreshToken","role","nonce"]) expect(account).not.toHaveProperty(privateField);
      await database.grantTablesToNonBypass(["user","account","session","global_session_identity_bindings","global_identity_evidence","recent_authentication_evidence"]);
      const protectedProvider=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId:fixture.sessionId}),(identity,run)=>database.withContext({userId:identity.userId,email:null},run,"non_bypass"));
      expect(await protectedProvider.getAuthenticatedAccount()).toMatchObject({userId:fixture.userId,googleAccount:{id:fixture.accountId},identityEvidence:{classification:"gmail"}});
    });
  },120_000);

  it("should not revive captured authority when an email change is later reversed",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      expect(await fixture.repository.capture(fixture.command)).toMatchObject({status:"stored"});
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public."user" set email=${`${randomUUID()}@gmail.com`} where id=${fixture.userId}`));
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public."user" set email=${fixture.email} where id=${fixture.userId}`));
      expect(await fixture.repository.getCurrent(fixture.command)).toBeNull();
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select invalidated_at is not null as invalidated,invalidation_reason from public.global_identity_evidence where account_id=${fixture.accountId}`)).rows)).toEqual([{invalidated:true,invalidation_reason:"identity_changed"}]);
      await expect(database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.global_identity_evidence set invalidated_at=null,invalidation_reason=null where account_id=${fixture.accountId}`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },120_000);

  it("should keep the account signed into this session when another Google account is linked",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      expect(await fixture.repository.capture(fixture.command)).toMatchObject({status:"stored"});
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${randomUUID()},${fixture.userId},'google',${randomUUID()},clock_timestamp(),clock_timestamp())`));
      const provider=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId:fixture.sessionId}),(identity,run)=>database.withContext({userId:identity.userId,email:null},run));
      expect(await provider.getAuthenticatedAccount()).toMatchObject({googleAccount:{id:fixture.accountId,subject:fixture.subject},identityEvidence:{accountId:fixture.accountId,subject:fixture.subject}});
    });
  },120_000);

  it("should keep a live session insufficient after its Google origin is unlinked instead of selecting another account",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);const anotherAccountId=randomUUID();const anotherSubject=randomUUID();
      expect(await fixture.repository.capture(fixture.command)).toMatchObject({status:"stored"});
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${anotherAccountId},${fixture.userId},'google',${anotherSubject},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`delete from public.account where id=${fixture.accountId}`);
      });
      const provider=new PostgresAuthenticatedAccountProvider(async()=>({userId:fixture.userId,sessionId:fixture.sessionId}),(identity,run)=>database.withContext({userId:identity.userId,email:null},run));
      expect(await provider.getAuthenticatedAccount()).toMatchObject({userId:fixture.userId,session:{id:fixture.sessionId},googleAccount:null,identityEvidence:null,recentAuthentication:[]});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select account_id,invalidated_at is not null as retired from public.global_session_identity_bindings where session_id=${fixture.sessionId}`)).rows)).toEqual([{account_id:null,retired:true}]);
    });
  },120_000);

  it("should persist signed minimal identity only for the current user, account and live session",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      const captured=await fixture.repository.capture(fixture.command);
      expect(captured).toMatchObject({status:"stored",evidence:{userId:fixture.userId,accountId:fixture.accountId,subject:fixture.subject,normalizedEmail:fixture.email,classification:"gmail",version:1}});
      const current=await fixture.repository.getCurrent(fixture.command);
      expect(current).toMatchObject({userId:fixture.userId,accountId:fixture.accountId,subject:fixture.subject,normalizedEmail:fixture.email,classification:"gmail"});
      expect(current).not.toHaveProperty("nonce");
      expect(current).not.toHaveProperty("authenticatedAt");
    });
  },120_000);

  it("should keep crossed and stale identity contexts insufficient without writing a capture",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      for(const command of [
        {...fixture.command,userId:fixture.otherUserId},
        {...fixture.command,sessionId:randomUUID()},
        {...fixture.command,evidence:{...fixture.command.evidence,subject:randomUUID()}},
        {...fixture.command,evidence:{...fixture.command.evidence,normalizedEmail:`${randomUUID()}@gmail.com`}},
      ]) expect(await fixture.repository.capture(command)).toEqual({status:"identity_mismatch"});
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.sessionId}`));
      expect(await fixture.repository.capture(fixture.command)).toEqual({status:"identity_mismatch"});
      expect(await fixture.repository.getCurrent(fixture.command)).toBeNull();
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id from public.global_identity_evidence where user_id=${fixture.userId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should serialize concurrent captures and retain one current capture with minimal history",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      const outcomes=await Promise.all([fixture.repository.capture(fixture.command),fixture.repository.capture(fixture.command)]);
      expect(outcomes.map((outcome)=>outcome.status)).toEqual(["stored","stored"]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as total,count(*) filter(where invalidated_at is null)::integer as current from public.global_identity_evidence where account_id=${fixture.accountId}`)).rows)).toEqual([{total:2,current:1}]);
      expect(await fixture.repository.getCurrent(fixture.command)).toMatchObject({userId:fixture.userId,subject:fixture.subject,classification:"gmail"});
    });
  },120_000);

  it("should stop exposing an older capture when current account email or session changes",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareIdentity(database);
      expect(await fixture.repository.capture(fixture.command)).toMatchObject({status:"stored"});
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public."user" set email=${`${randomUUID()}@gmail.com`} where id=${fixture.userId}`));
      expect(await fixture.repository.getCurrent(fixture.command)).toBeNull();
      expect(await fixture.repository.capture(fixture.command)).toEqual({status:"identity_mismatch"});
      const anotherContext=new PostgresGlobalIdentityEvidenceRepository((callback)=>database.withContext({userId:fixture.otherUserId,email:null},callback));
      expect(await anotherContext.getCurrent(fixture.command)).toBeNull();
      expect(await anotherContext.capture(fixture.command)).toEqual({status:"identity_mismatch"});
    });
  },120_000);
});
