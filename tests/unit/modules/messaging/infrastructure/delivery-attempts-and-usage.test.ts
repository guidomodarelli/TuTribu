/** @vitest-environment node */

/** Exercises persisted countries, usage versions, leases and a concurrent last attempt slot. */
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { messagingUsagePolicies } from "@/src/modules/shared/infrastructure/database/schema";

/** Applies the shipped artifacts to an owned branch, never rewritten SQL. */
async function applyMessagingMigrations(database: AcademyAdmissionTestDatabase): Promise<void> {
  for (const artifact of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql","20261005092500_guard_messaging_attempts.sql"]) await database.applyMigration(artifact);
}

/** Seeds a prepared synthetic SMS candidate without contacting any provider. */
async function seedMessagingCandidate(database: AcademyAdmissionTestDatabase) {
  const leaderId=randomUUID(); const tribeId=randomUUID(); const connectionId=randomUUID();
  const own={userId:leaderId,email:null};
  await database.withContext(own,async (transaction)=>{
    await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${leaderId},'Synthetic country leader',${`${leaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic country tribe',${`countries-${tribeId}`},${leaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${tribeId})`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${tribeId},${leaderId},'ready','synthetic-local','synthetic-epoch',true,1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,sms_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${connectionId},${tribeId},1,'synthetic-local','synthetic-epoch','synthetic-sms','valid',clock_timestamp(),false)`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,checked_at) values (${tribeId},${connectionId},1,'sms','synthetic-sms',clock_timestamp())`);
  });
  return {own,leaderId,tribeId,connectionId};
}

/** Persists a real diagnostic/challenge/delivery cycle with an opaque test envelope. */
async function seedDiagnosticDelivery(database: AcademyAdmissionTestDatabase,candidate: Awaited<ReturnType<typeof seedMessagingCandidate>>,country: string,policyVersion: number) {
  const deliveryId=randomUUID(); const challengeId=randomUUID(); const diagnosticId=randomUUID(); const envelopeId=randomUUID();
  await database.withContext(candidate.own,async (transaction)=>{
    const instant=new Date(String((await transaction.execute(sql`select clock_timestamp() as now`)).rows[0].now));
    const expiresAt=new Date(instant.getTime()+5*60_000);
    await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,recipient_country,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${deliveryId},${candidate.tribeId},${candidate.connectionId},1,'synthetic-local','synthetic-epoch','connection_diagnostic',${diagnosticId},${candidate.leaderId},${`synthetic-destination-${deliveryId}`},${country},'sms',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',${policyVersion},${instant},${instant},${expiresAt})`);
    await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,connection_id,connection_version,security_epoch,channel,created_at,expires_at,code_mac,mac_key_id,code_envelope_id,delivery_id) values (${challengeId},${candidate.leaderId},${candidate.tribeId},'phone',${`synthetic-phone-${deliveryId}`},${randomBytes(32)},'synthetic-contact','connection_diagnostic',${candidate.connectionId},1,'synthetic-epoch','sms',${instant},${expiresAt},${randomBytes(32)},'synthetic-code',${envelopeId},${deliveryId})`);
    await transaction.execute(sql`insert into public.verification_code_envelopes(id,tribe_id,connection_id,connection_version,challenge_id,delivery_id,environment,security_epoch,key_id,iv,ciphertext,created_at,expires_at) values (${envelopeId},${candidate.tribeId},${candidate.connectionId},1,${challengeId},${deliveryId},'synthetic-local','synthetic-epoch','synthetic-cipher',${randomBytes(12)},${randomBytes(32)},${instant},${expiresAt})`);
    await transaction.execute(sql`insert into public.messaging_connection_diagnostics(id,tribe_id,connection_id,connection_version,leader_user_id,challenge_id,channel,sender_id) values (${diagnosticId},${candidate.tribeId},${candidate.connectionId},1,${candidate.leaderId},${challengeId},'sms','synthetic-sms')`);
  });
  return {deliveryId,challengeId,envelopeId};
}

/** Claims a single due delivery and commits before authorizing its attempt. */
async function claimAndAuthorize(database: AcademyAdmissionTestDatabase,own: {userId:string;email:null}) {
  const leaseToken=randomUUID();
  const claimed=await database.withContext(own,async (transaction)=>(await transaction.execute(sql`select * from public.claim_messaging_deliveries(${leaseToken},1,90)`)).rows[0]);
  expect(claimed).toBeDefined();
  const result=await database.withContext(own,async (transaction)=>(await transaction.execute<{delivery_id:string;outcome:string;attempt_id:string|null;delivery_version:number}>(sql`select * from public.authorize_messaging_delivery_attempt(${claimed.delivery_id},${leaseToken},${claimed.delivery_version},'synthetic-local','synthetic-epoch')`)).rows[0]);
  return {...result,leaseToken};
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("messaging delivery storage and usage", () => {
  it("should start countries empty without a connection and preserve configuration versions independently of consumption", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      await database.applyMigration("20261005091500_guard_admission_evidence_transitions.sql");
      await database.applyMigration("20261005092000_create_tenant_messaging.sql");
      const leaderId = randomUUID();
      const tribeId = randomUUID();
      const own = { userId: leaderId, email: null };
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${leaderId},'Synthetic messaging leader',${`${leaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes (id,name,slug,created_by) values (${tribeId},'Synthetic messaging tribe',${`messaging-${tribeId}`},${leaderId})`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
      });
      const policy = await database.withContext(own, async (transaction) => (await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,changed_by_user_id) values (${tribeId},${leaderId}) returning version,allowed_countries,verification_daily_limit,notification_daily_limit`)).rows);
      expect(policy).toEqual([{ version: 1, allowed_countries: [], verification_daily_limit: 100, notification_daily_limit: 200 }]);
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'] where tribe_id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${tribeId}`));
      const reorderedNoOp = await database.withContext(own, async (transaction) => (await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'] where tribe_id=${tribeId} and version=2 returning version`)).rows);
      expect(reorderedNoOp).toEqual([{ version: 2 }]);
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.messaging_usage_policies set version=version+1 where tribe_id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const staleEdits = await database.withContext(own, async (transaction) => (await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['US'],version=version+1 where tribe_id=${tribeId} and version=1 returning version`)).rows);
      expect(staleEdits).toEqual([]);
      const projected = await database.withContext(own, async (transaction) => transaction.select({ version: messagingUsagePolicies.version, allowedCountries: messagingUsagePolicies.allowedCountries }).from(messagingUsagePolicies).where(eq(messagingUsagePolicies.tribeId,tribeId)));
      expect(projected).toEqual([{ version: 2, allowedCountries: ["AR"] }]);
      const contactSubject = await database.withContext(own, async (transaction) => (await transaction.execute(sql`insert into public.messaging_contact_budget_subjects(id) values (${randomUUID()}) returning id`)).rows[0].id);
      await database.withContext(own, async (transaction) => transaction.execute(sql`insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint) values (${contactSubject},'synthetic-fingerprint',${randomBytes(32)})`));
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select verification_epoch from public.academy_admission_policies where tribe_id=${tribeId}`)).rows)).toEqual([]);
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.tenant_messaging_connections where tribe_id=${tribeId}`)).rows)).toEqual([]);
    });
  },120_000);

  it.each([
    {name:"sandbox credentials",testMode:true,oldDiagnostic:false,expected:"suppressed"},
    {name:"an unchanged active capability tested more than twenty-four hours ago",testMode:false,oldDiagnostic:true,expected:"authorized"},
  ])("should evaluate production use with $name",async ({testMode,oldDiagnostic,expected})=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      await applyMessagingMigrations(database);
      const candidate=await seedMessagingCandidate(database);
      const deliveryId=randomUUID();
      await database.withContext(candidate.own,async (transaction)=>{
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,email_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${candidate.connectionId},${candidate.tribeId},2,'synthetic-local','synthetic-epoch','synthetic-email','valid',clock_timestamp(),${testMode})`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${candidate.tribeId},${candidate.connectionId},2,'email','synthetic-email','prepared',clock_timestamp()-${oldDiagnostic?25:0}*interval '1 hour',clock_timestamp()-${oldDiagnostic?25:0}*interval '1 hour')`);
        await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=2,is_candidate=false,candidate_version=null,state='active' where id=${candidate.connectionId}`);
        await transaction.execute(sql`with instant as (select clock_timestamp() as now) insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) select ${deliveryId},${candidate.tribeId},${candidate.connectionId},2,'synthetic-local','synthetic-epoch','admission_notification',${randomUUID()},${candidate.leaderId},'synthetic-email-destination','email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,now,now,now+interval '1 hour' from instant`);
      });
      const result=await claimAndAuthorize(database,candidate.own);
      expect(result.outcome).toBe(expected);
      const reservations=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${deliveryId}`)).rows);
      expect(reservations).toEqual(testMode?[]:[{state:"consumed"}]);
    });
  },120_000);

  it("should keep tenant, source, immutable intent and secrets protected under the real non-bypass role",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      await applyMessagingMigrations(database);
      const first=await seedMessagingCandidate(database);
      const second=await seedMessagingCandidate(database);
      const diagnostic=await seedDiagnosticDelivery(database,first,"AR",1);
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`update public.messaging_connection_versions set sms_sender_id='different-sender' where connection_id=${first.connectionId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`update public.message_deliveries set recipient_country='US' where id=${diagnostic.deliveryId}`))).rejects.toMatchObject({cause:{code:"23514"}});
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`update public.contact_verification_challenges set connection_id=${second.connectionId} where id=${diagnostic.challengeId}`))).rejects.toMatchObject({code:"23503"});
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`update public.verification_code_envelopes set expires_at=expires_at-interval '1 minute' where id=${diagnostic.envelopeId}`))).rejects.toMatchObject({code:"23514"});
      await database.grantTablesToNonBypass(["tenant_messaging_connections","messaging_connection_versions","messaging_secret_envelopes","verification_code_envelopes"]);
      const ordinary=await database.withContext(first.own,async (transaction)=>(await transaction.execute(sql`select ciphertext from public.verification_code_envelopes where id=${diagnostic.envelopeId}`)).rows,"non_bypass");
      expect(ordinary).toEqual([]);
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`insert into public.verification_code_envelopes(tribe_id,connection_id,connection_version,challenge_id,delivery_id,environment,security_epoch,key_id,iv,ciphertext,created_at,expires_at) values (${first.tribeId},${first.connectionId},1,${diagnostic.challengeId},${diagnostic.deliveryId},'synthetic-local','synthetic-epoch','synthetic-cipher',${randomBytes(12)},${randomBytes(32)},clock_timestamp(),clock_timestamp()+interval '1 minute')`),"non_bypass")).rejects.toMatchObject({cause:{code:"42501"}});
      await database.withContext(first.own,async (transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,state='suspended' where id=${first.connectionId}`));
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`insert into public.tenant_messaging_connections(tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate) values (${first.tribeId},${first.leaderId},'draft','synthetic-local','synthetic-epoch',true,false)`))).rejects.toMatchObject({cause:{code:"23505"}});
      await expect(database.withContext(first.own,async (transaction)=>transaction.execute(sql`select * from public.claim_messaging_deliveries(${randomUUID()},null,90)`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },120_000);

  it("should partition claims across workers and reclaim only a lease without an attempt marker",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      await applyMessagingMigrations(database);
      const candidate=await seedMessagingCandidate(database);
      const first=await seedDiagnosticDelivery(database,candidate,"AR",1);
      const second=await seedDiagnosticDelivery(database,candidate,"AR",1);
      const leases=[randomUUID(),randomUUID()];
      const claims=await Promise.all(leases.map((lease)=>database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select * from public.claim_messaging_deliveries(${lease},1,90)`)).rows[0])));
      expect(new Set(claims.map((claim)=>claim.delivery_id))).toEqual(new Set([first.deliveryId,second.deliveryId]));
      await database.withContext(candidate.own,async (transaction)=>transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=${first.deliveryId}`));
      const changed=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select public.reconcile_expired_messaging_leases(1) as changed`)).rows);
      expect(changed).toEqual([{changed:1}]);
      const reclaimed=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select * from public.claim_messaging_deliveries(${randomUUID()},1,90)`)).rows[0]);
      expect(reclaimed.delivery_id).toBe(first.deliveryId);
      expect(reclaimed.delivery_version).toBe(4);
      expect(await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select id from public.message_delivery_attempts where tribe_id=${candidate.tribeId}`)).rows)).toEqual([]);
    });
  },120_000);

  it("should revalidate empty, forbidden and removed countries before the marker and retain an initiated reservation",async ()=>{
    await withAcademyAdmissionDatabase(async (database)=>{
      await applyMessagingMigrations(database);
      const candidate=await seedMessagingCandidate(database);
      await seedDiagnosticDelivery(database,candidate,"AR",1);
      expect(await claimAndAuthorize(database,candidate.own)).toMatchObject({outcome:"suppressed",attempt_id:null});
      await database.withContext(candidate.own,async (transaction)=>transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${candidate.tribeId}`));
      await seedDiagnosticDelivery(database,candidate,"US",2);
      expect(await claimAndAuthorize(database,candidate.own)).toMatchObject({outcome:"suppressed",attempt_id:null});
      const removed=await seedDiagnosticDelivery(database,candidate,"AR",2);
      await database.withContext(candidate.own,async (transaction)=>transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${candidate.tribeId}`));
      expect(await claimAndAuthorize(database,candidate.own)).toMatchObject({outcome:"suppressed",attempt_id:null});
      expect(await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select state,is_current,invalidated_at from public.contact_verification_challenges where id=${removed.challengeId}`)).rows)).toEqual([{state:"issued",is_current:true,invalidated_at:null}]);
      expect(await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select id from public.messaging_usage_reservations where tribe_id=${candidate.tribeId}`)).rows)).toEqual([]);
      await database.withContext(candidate.own,async (transaction)=>transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${candidate.tribeId}`));
      const initiated=await seedDiagnosticDelivery(database,candidate,"AR",2);
      const authorized=await claimAndAuthorize(database,candidate.own);
      expect(authorized).toMatchObject({outcome:"authorized",delivery_id:initiated.deliveryId});
      expect(await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select authorized_usage_policy_version,recipient_country from public.message_delivery_attempts where id=${authorized.attempt_id}`)).rows)).toEqual([{authorized_usage_policy_version:4,recipient_country:"AR"}]);
      await database.withContext(candidate.own,async (transaction)=>transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${candidate.tribeId}`));
      const completed=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select * from public.complete_messaging_delivery_attempt(${authorized.attempt_id},${authorized.leaseToken},1,'accepted','synthetic-provider-id','synthetic-correlation',null)`)).rows[0]);
      expect(completed).toMatchObject({outcome:"completed",attempt_version:2});
      const stale=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select * from public.complete_messaging_delivery_attempt(${authorized.attempt_id},${authorized.leaseToken},1,'unknown',null,null,'response_lost')`)).rows[0]);
      expect(stale.outcome).toBe("stale");
      const late=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select * from public.complete_messaging_delivery_attempt(${authorized.attempt_id},${authorized.leaseToken},2,'delivered','synthetic-provider-id','synthetic-correlation',null)`)).rows[0]);
      expect(late).toMatchObject({outcome:"completed",attempt_version:3});
      const states=await database.withContext(candidate.own,async (transaction)=>(await transaction.execute(sql`select delivery.state,policy.version,reservation.state as reservation_state from public.message_deliveries delivery join public.messaging_usage_policies policy on policy.tribe_id=delivery.tribe_id join public.messaging_usage_reservations reservation on reservation.delivery_id=delivery.id where delivery.id=${initiated.deliveryId}`)).rows);
      expect(states).toEqual([{state:"delivered",version:5,reservation_state:"consumed"}]);
    });
  },120_000);

  it("should allow one of one hundred competitors to authorize the last slot and preserve it after a lost worker", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const artifact of ["20261005090000_create_admission_identity_evidence.sql","20261005091000_create_academy_admission_core.sql","20261005091500_guard_admission_evidence_transitions.sql","20261005092000_create_tenant_messaging.sql"]) await database.applyMigration(artifact);
      await database.applyMigration("20261005092500_guard_messaging_attempts.sql");
      const leaderId = randomUUID(); const tribeId = randomUUID(); const connectionId = randomUUID(); const leaseToken = randomUUID();
      const own = { userId: leaderId, email: null };
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${leaderId},'Synthetic slot leader',${`${leaderId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic slot tribe',${`slot-${tribeId}`},${leaderId})`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active')`);
        await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,notification_daily_limit) values (${tribeId},1)`);
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version) values (${connectionId},${tribeId},${leaderId},'active','synthetic-local','synthetic-epoch',true,false,1)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,email_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${connectionId},${tribeId},1,'synthetic-local','synthetic-epoch','synthetic-sender','valid',clock_timestamp(),false)`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${tribeId},${connectionId},1,'email','synthetic-sender','prepared',clock_timestamp(),clock_timestamp())`);
        for (let index=0;index<100;index++) await transaction.execute(sql`
          with instant as (select clock_timestamp() as now)
          insert into public.message_deliveries(tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at)
          select ${tribeId},${connectionId},1,'synthetic-local','synthetic-epoch','admission_notification',${randomUUID()},${leaderId},${`synthetic-recipient-${index}`},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,now,now,now+interval '1 hour' from instant
        `);
      });
      const claimed = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select * from public.claim_messaging_deliveries(${leaseToken},100,300)`)).rows);
      expect(claimed).toHaveLength(100);
      const outcomes = await Promise.all(claimed.map((delivery) => database.withContext(own, async (transaction) => (await transaction.execute(sql`select * from public.authorize_messaging_delivery_attempt(${delivery.delivery_id},${leaseToken},${delivery.delivery_version},'synthetic-local','synthetic-epoch')`)).rows[0])));
      expect(outcomes.filter((outcome) => outcome.outcome === "authorized")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.outcome === "quota_exceeded")).toHaveLength(99);
      const winner = outcomes.find((outcome) => outcome.outcome === "authorized")!;
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=${winner.delivery_id}`));
      await database.withContext(own, async (transaction) => transaction.execute(sql`select public.reconcile_expired_messaging_leases()`));
      const afterLoss = await database.withContext(own, async (transaction) => {
        const delivery = await transaction.execute(sql`select state from public.message_deliveries where id=${winner.delivery_id}`);
        const attempts = await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${winner.delivery_id}`);
        const reservations = await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${winner.delivery_id}`);
        const policy = await transaction.execute(sql`select version from public.messaging_usage_policies where tribe_id=${tribeId}`);
        return { delivery: delivery.rows, attempts: attempts.rows, reservations: reservations.rows, policy: policy.rows };
      });
      expect(afterLoss).toEqual({ delivery: [{ state: "unknown" }], attempts: [{ state: "unknown" }], reservations: [{ state: "consumed" }], policy: [{ version: 1 }] });
      const replay = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select * from public.authorize_messaging_delivery_attempt(${winner.delivery_id},${leaseToken},${winner.delivery_version},'synthetic-local','synthetic-epoch')`)).rows[0]);
      expect(replay.outcome).toBe("stale");
    }, { concurrentTransactions: 100 });
  },120_000);
});
