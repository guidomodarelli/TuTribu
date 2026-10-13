/** @vitest-environment node */
/** Exercises a single confirmed applicant obligation without draining another delivery or impersonating applicant authority as a worker. @module scoped-admission-delivery-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareAdmissionContactVerification} from "@/tests/support/admission-contact-verification-fixture";
import {PostgresAdmissionContactVerificationOperations} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import {PostgresMessageDeliveryRepository} from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("focal admission dispatch",()=>{
  it("should claim only the actual applicant challenge through its contributing leader and reject crossed account, challenge, purpose and resource scopes",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database);await database.applyMigration("20261005092500_guard_messaging_attempts.sql");await database.applyMigration("20261006140000_claim_messaging_deliveries_fairly.sql");await database.applyMigration("20261007050000_claim_scoped_diagnostic_delivery.sql");
      await database.applyMigration("20261008210000_claim_scoped_admission_delivery.sql");
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations=new PostgresAdmissionContactVerificationOperations((_scope,run)=>database.withContext(fixture.own,run),async()=>fixture.fixture.config),issued=await operations.issue({...fixture.input,expectedPolicyVersion:2});if(issued.state!=="completed")throw new Error("Expected committed applicant challenge");
      const unrelated=await fixture.fixture.issue();if(unrelated.state!=="completed"||unrelated.result.outcome!=="issued")throw new Error("Expected unrelated contributing-account obligation");
      const unrelatedDeliveryId=unrelated.result.deliveryId;
      const deliveryId=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{delivery_id:string}>(sql`select delivery_id from public.contact_verification_challenges where id=${issued.result.challengeId} and user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId}`)).rows[0].delivery_id);
      const scope={purpose:"admission"as const,deliveryId,challengeId:issued.result.challengeId,applicantUserId:fixture.context.userId,tribeId:fixture.context.tribeId,contributingLeaderUserId:fixture.fixture.userId,connectionId:fixture.fixture.scope.connectionId,connectionVersion:fixture.fixture.scope.connectionVersion};
      const execute=<Result>(actor:string|null,run:(transaction:RequestDatabase)=>Promise<Result>)=>database.withContext({userId:actor,email:null},run),command={leaseToken:randomUUID(),limit:2,leaseSeconds:90};
      await expect(database.withContext(fixture.own,(transaction)=>transaction.execute(sql`select * from public.claim_scoped_messaging_admission(${scope.deliveryId},${scope.tribeId},${scope.contributingLeaderUserId},${scope.applicantUserId},${scope.challengeId},${scope.connectionId},${scope.connectionVersion},${randomUUID()},90)`),"non_bypass")).rejects.toMatchObject({cause:{code:"42501"}});
      const repository=new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.fixture.config,scope);
      expect(await new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.fixture.config,{...scope,applicantUserId:randomUUID()}).claim({...command,leaseToken:randomUUID()})).toEqual([]);
      expect(await new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.fixture.config,{...scope,challengeId:randomUUID()}).claim({...command,leaseToken:randomUUID()})).toEqual([]);
      expect(await new PostgresMessageDeliveryRepository(execute,async()=>true,async()=>fixture.fixture.config,{...scope,connectionVersion:2}).claim({...command,leaseToken:randomUUID()})).toEqual([]);
      const claims=await repository.claim(command);expect(claims).toEqual([{deliveryId,tribeId:scope.tribeId,contributingLeaderUserId:scope.contributingLeaderUserId,leaseToken:command.leaseToken,version:2}]);
      const untouched=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select lease_token,version,state from public.message_deliveries where id=${unrelatedDeliveryId}`)).rows[0]);expect(untouched).toEqual({lease_token:null,version:1,state:"queued"});
      await expect(repository.authorize({...claims[0],deliveryId:randomUUID()},randomUUID())).rejects.toMatchObject({code:"permission_denied"});await expect(repository.reconcileExpiredLeases(1)).rejects.toMatchObject({code:"permission_denied"});
      const counts=await database.withContext(fixture.fixture.own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where tribe_id=${scope.tribeId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${scope.tribeId}) as reservations`)).rows[0]);expect(counts).toEqual({attempts:0,reservations:0});
    });
  },600_000);
});
