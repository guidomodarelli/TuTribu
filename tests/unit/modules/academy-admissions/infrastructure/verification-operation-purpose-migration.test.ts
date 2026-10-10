/** @vitest-environment node */
/** Exercises historical purpose backfill from complete native lineage and immutable metadata on real PostgreSQL. @module verification-operation-purpose-migration-tests */
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareContactVerificationDatabase} from "@/tests/support/contact-verification-database-fixture";
import {createAdmissionOperationFingerprint} from "@/src/modules/academy-admissions/infrastructure/verification/admission-operation-fingerprint";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("verification purpose migration",()=>{
  it("should backfill only a completed diagnostic with exact ledger/delivery/challenge provenance and preserve original snapshots",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationDatabase(database),tribeId=randomUUID(),connectionId=randomUUID(),good={ledgerId:randomUUID(),operationId:randomUUID(),challengeId:randomUUID(),deliveryId:randomUUID(),diagnosticId:randomUUID()},wrong={ledgerId:randomUUID(),operationId:randomUUID(),challengeId:randomUUID(),deliveryId:randomUUID(),diagnosticId:randomUUID()},startedId=randomUUID(),deniedId=randomUUID();
      await database.applyMigration("20261005101000_guard_admission_operation_identity.sql");
      await database.withContext(fixture.own,async(transaction)=>{
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic legacy operation tribe',${`legacy-${tribeId}`},${fixture.userId})`);
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${tribeId},${fixture.userId},'draft',${fixture.config.environment},${fixture.config.securityEpoch},true,1)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch})`);
        const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),expiresAt=new Date(now.getTime()+600_000);
        for(const entry of[good,wrong]){
          const command={actorUserId:fixture.userId,tribeId,operationType:"issue_contact_challenge",idempotencyKey:entry.operationId,intent:{purpose:"connection_diagnostic",connectionId}},signed=await createAdmissionOperationFingerprint(fixture.config).sign(command),result={outcome:"issued",diagnosticId:entry.diagnosticId,challengeId:entry.challengeId,deliveryId:entry.deliveryId,connectionId,connectionVersion:1,channel:"email",maskedDestination:"s••••@example.test",expiresAt:expiresAt.toISOString(),resendAllowedAt:new Date(now.getTime()+60_000).toISOString()};
          await transaction.execute(sql`insert into public.academy_admission_operations(id,actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,public_result,created_at,completed_at) values (${entry.ledgerId},${fixture.userId},${tribeId},${command.operationType},${entry.operationId},${Buffer.from(signed.digest)},${signed.keyId},'completed',${JSON.stringify(result)}::jsonb,${now},${now})`);
          await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${entry.deliveryId},${tribeId},${connectionId},1,${fixture.config.environment},${fixture.config.securityEpoch},'connection_diagnostic',${entry.diagnosticId},${fixture.userId},${entry.challengeId},'email',${entry===good?entry.ledgerId:randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${now},${now},${expiresAt})`);
          await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,connection_id,connection_version,security_epoch,channel,state,is_current,created_at,expires_at,code_mac,mac_key_id,delivery_id) values (${entry.challengeId},${fixture.userId},${tribeId},'email',${`${entry.challengeId}@example.test`},${randomBytes(32)},'synthetic-contact','connection_diagnostic',${connectionId},1,${fixture.config.securityEpoch},'email','issued',true,${now},${expiresAt},${randomBytes(32)},'synthetic-code',${entry.deliveryId})`);
          await transaction.execute(sql`insert into public.messaging_connection_diagnostics(id,tribe_id,connection_id,connection_version,leader_user_id,challenge_id,channel,sender_id) values (${entry.diagnosticId},${tribeId},${connectionId},1,${fixture.userId},${entry.challengeId},'email','synthetic-sender')`);
        }
        for(const [id,state] of[[startedId,"started"],[deniedId,"completed"]] as const){
          const signed=await createAdmissionOperationFingerprint(fixture.config).sign({actorUserId:fixture.userId,tribeId,operationType:"resend_contact_challenge",idempotencyKey:id,intent:{purpose:"connection_diagnostic"}});
          await transaction.execute(sql`insert into public.academy_admission_operations(id,actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,public_result,created_at,completed_at) values (${id},${fixture.userId},${tribeId},'resend_contact_challenge',${id},${Buffer.from(signed.digest)},${signed.keyId},${state},${state==="completed"?JSON.stringify({outcome:"denied",code:"recipient_not_allowed"}):null}::jsonb,${now},${state==="completed"?now:null})`);
        }
      });
      const snapshot=()=>database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,state,version,public_result,lease_owner,lease_until,completed_at from public.academy_admission_operations where tribe_id=${tribeId} order by id`)).rows),before=await snapshot();
      await database.applyMigration("20261007231500_bind_verification_operation_purpose.sql");expect(await snapshot()).toEqual(before);
      const purposes=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select id,verification_purpose from public.academy_admission_operations where tribe_id=${tribeId} order by id`)).rows);
      expect(purposes).toEqual(expect.arrayContaining([{id:good.ledgerId,verification_purpose:"connection_diagnostic"},{id:wrong.ledgerId,verification_purpose:null},{id:startedId,verification_purpose:null},{id:deniedId,verification_purpose:null}]));
      await expect(database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_operations set verification_purpose='admission' where id=${good.ledgerId}`))).rejects.toMatchObject({cause:{code:"23514"}});
    });
  },300_000);
});
