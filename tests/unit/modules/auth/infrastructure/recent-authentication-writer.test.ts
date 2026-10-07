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
import {PostgresReauthenticationResourceAuthorizer} from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {persistCompletedGlobalAuthentication} from "@/src/modules/auth/infrastructure/composition/complete-global-authentication";

/** Seeds real global sessions and canonical leadership without any external login. */
async function prepareRecentAuthentication(database:AcademyAdmissionTestDatabase) {
  await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
  const userId=randomUUID();const accountId=randomUUID();const subject=randomUUID();const originalSessionId=randomUUID();const sessionId=randomUUID();const tribeId=randomUUID();
  const email=`${userId}@gmail.com`;const own={userId,email};const returnPath=`/recent-${tribeId}`;const operation="save_messaging_credentials";
  await database.withContext(own,async(transaction)=>{
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic recent identity',${email},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},clock_timestamp(),clock_timestamp())`);
    for(const identitySessionId of [originalSessionId,sessionId]) await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${identitySessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic recent tribe',${`recent-${tribeId}`},${userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${userId},'leader','active')`);
  });
  const repository=new PostgresRecentAuthenticationRepository((run)=>database.withContext(own,run),(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction));
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
  it("should permit usage configuration returns only for the exact current tribe and usage action",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database),returnPath=`${fixture.returnPath}/academia/admissions/messaging`;
      for(const operation of [REAUTHENTICATION_OPERATION.initializeMessagingUsage,REAUTHENTICATION_OPERATION.updateMessagingUsage]) {
        expect(await fixture.repository.create({...fixture.scope,operation,returnPath})).toMatchObject({status:"created",intent:{returnPath,operation}});
        expect(await fixture.repository.create({...fixture.scope,operation,returnPath:"/another-academy/academia/admissions/messaging"})).toEqual({status:"context_unavailable"});
      }
      expect(await fixture.repository.create({...fixture.scope,operation:REAUTHENTICATION_OPERATION.updateAdmissionPolicy,returnPath})).toEqual({status:"context_unavailable"});
    });
  },120_000);

  it("should allow the exact policy settings return for owned policy actions while rejecting foreign paths and unrelated operations",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database),settingsPath=`${fixture.returnPath}/academia/admissions/settings`;
      for(const operation of [REAUTHENTICATION_OPERATION.updateAdmissionPolicy,REAUTHENTICATION_OPERATION.activateAdmissionPolicy,REAUTHENTICATION_OPERATION.pauseAdmissionPolicy]) {
        const created=await fixture.repository.create({...fixture.scope,operation,returnPath:settingsPath});
        expect(created).toMatchObject({status:"created",intent:{returnPath:settingsPath,operation}});
        expect(await fixture.repository.create({...fixture.scope,operation,returnPath:"/another-academy/academia/admissions/settings"})).toEqual({status:"context_unavailable"});
      }
      expect(await fixture.repository.create({...fixture.scope,operation:REAUTHENTICATION_OPERATION.saveMessagingCredentials,returnPath:settingsPath})).toEqual({status:"context_unavailable"});
    });
  },120_000);

  it("should close an intent read when the current session expires during the resource read",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      if(created.status!=="created")throw new Error("Synthetic intent creation failed");
      const repository=new PostgresRecentAuthenticationRepository((run)=>database.withContext(fixture.own,run),(transaction)=>({resolve:async(scope)=>{
        const resource=await new PostgresReauthenticationResourceAuthorizer(transaction).resolve(scope);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.originalSessionId}`);
        return resource;
      }}));
      expect(await repository.read({intentId:created.intent.id,userId:fixture.userId,sessionId:fixture.originalSessionId,accountId:fixture.accountId,subject:fixture.subject})).toBeNull();
    });
  },120_000);

  it("should co-commit the native session binding, identity capture and exact nonce recency",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      if(created.status!=="created") throw new Error("Synthetic intent creation failed");
      const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
      if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
      const callback=await signedCallback(fixture,issued.nonce,Math.floor(Date.now()/1000));
      expect(await database.withContext(fixture.own,(transaction)=>persistCompletedGlobalAuthentication(transaction,{...callback,reauthenticationIntentId:created.intent.id}))).toEqual({status:"stored"});
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select account_id,provider_subject from public.global_session_identity_bindings where session_id=${fixture.sessionId}`)).rows)).toEqual([{account_id:fixture.accountId,provider_subject:fixture.subject}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state from public.global_reauthentication_intents where id=${created.intent.id}`)).rows)).toEqual([{state:"consumed"}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as total from public.global_identity_evidence where account_id=${fixture.accountId} and invalidated_at is null`)).rows)).toEqual([{total:1}]);
      expect(await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::integer as total from public.recent_authentication_evidence where intent_id=${created.intent.id} and session_id=${fixture.sessionId}`)).rows)).toEqual([{total:1}]);
    });
  },120_000);

  it("should resolve each real resource kind only in its owned tribe and allowed operation",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      await database.applyMigration("20261005092000_create_tenant_messaging.sql");
      const connectionId=randomUUID();const entryId=randomUUID();const importId=randomUUID();const invitationId=randomUUID();const requestId=randomUUID();
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,environment,security_epoch) values (${connectionId},${fixture.tribeId},'synthetic','synthetic-epoch')`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id) values (${entryId},${fixture.tribeId},'email',${fixture.email},${Buffer.alloc(32)},'synthetic')`);
        await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,expires_at,purge_after) values (${importId},${fixture.tribeId},${fixture.userId},'email',1,${Buffer.alloc(32)},'synthetic',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`);
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,token_hash,token_key_id) values (${invitationId},${fixture.tribeId},'email',${fixture.email},${Buffer.alloc(32)},'synthetic',${Buffer.alloc(32)},'synthetic')`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${fixture.tribeId},${fixture.userId},'common',clock_timestamp()+interval '29 days')`);
      });
      for(const resource of [
        {operation:REAUTHENTICATION_OPERATION.saveMessagingCredentials,resourceId:fixture.tribeId},
        {operation:REAUTHENTICATION_OPERATION.validateMessagingConnection,resourceId:connectionId},
        {operation:REAUTHENTICATION_OPERATION.updateAllowlistEntry,resourceId:entryId},
        {operation:REAUTHENTICATION_OPERATION.confirmAllowlistImport,resourceId:importId},
        {operation:REAUTHENTICATION_OPERATION.renamePersonalInvitation,resourceId:invitationId},
        {operation:REAUTHENTICATION_OPERATION.advanceAdmissionRetry,resourceId:requestId},
      ]) {
        const resolve=(scope:typeof fixture.scope)=>database.withContext(fixture.own,async(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction).resolve(scope));
        expect(await resolve({...fixture.scope,...resource})).toEqual({allowedReturnPaths:[fixture.returnPath]});
        expect(await resolve({...fixture.scope,...resource,tribeId:randomUUID()})).toBeNull();
        expect(await resolve({...fixture.scope,...resource,operation:"unknown_action"})).toBeNull();
      }
      await database.withContext(fixture.own,async(transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set retired_at=clock_timestamp() where id=${connectionId}`));
      expect(await database.withContext(fixture.own,async(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction).resolve({...fixture.scope,operation:REAUTHENTICATION_OPERATION.validateMessagingConnection,resourceId:connectionId}))).toBeNull();
    });
  },120_000);

  it("should consume the issued nonce once and emit signed recency in the same commit",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareRecentAuthentication(database);
      const created=await fixture.repository.create({...fixture.scope,returnPath:fixture.returnPath});
      expect(created).toMatchObject({status:"created",intent:{version:1,status:"created"}});
      if(created.status!=="created") throw new Error("Synthetic intent creation failed");
      expect(await fixture.repository.read({...fixture.scope,intentId:created.intent.id})).toMatchObject({id:created.intent.id,status:"created",version:1});
      const issued=await fixture.repository.issueNonce({...fixture.scope,intentId:created.intent.id});
      expect(issued).toMatchObject({status:"authorizing"});
      if(issued.status!=="authorizing") throw new Error("Synthetic nonce issuance failed");
      const callback=await signedCallback(fixture,issued.nonce,Math.floor(Date.now()/1000));
      const outcome=await fixture.repository.complete({...callback,intentId:created.intent.id});
      expect(outcome).toMatchObject({status:"consumed",evidence:{sessionId:fixture.sessionId,accountId:fixture.accountId,subject:fixture.subject,tribeId:fixture.tribeId,operation:fixture.operation,resourceId:fixture.tribeId}});
      expect(await fixture.repository.read({...fixture.scope,sessionId:fixture.sessionId,intentId:created.intent.id})).toMatchObject({id:created.intent.id,status:"consumed",version:3});
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
