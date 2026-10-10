/** @vitest-environment node */
/** Exercises native applicant/challenge lineage before deriving a private contributing-worker scope. @module admission-verification-dispatch-context-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareAdmissionContactVerification} from "@/tests/support/admission-contact-verification-fixture";
import {PostgresAdmissionContactVerificationOperations,type AdmissionVerificationDatabaseExecutor} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import {PostgresAdmissionVerificationDispatchContext} from "@/src/modules/academy-admissions/infrastructure/verification/postgres-admission-verification-dispatch-context";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native applicant dispatch context",()=>{
  it("should derive contributor/resource only for the native own admission challenge and reject crossed or expired authority",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database);await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const execute:AdmissionVerificationDatabaseExecutor=(_scope,run)=>database.withContext(fixture.own,run),operations=new PostgresAdmissionContactVerificationOperations(execute,async()=>fixture.fixture.config),issued=await operations.issue({...fixture.input,expectedPolicyVersion:2});if(issued.state!=="completed")throw new Error("Expected applicant committed code");
      const resolver=new PostgresAdmissionVerificationDispatchContext(execute),intent={userId:fixture.context.userId,sessionId:fixture.context.sessionId,tribeId:fixture.context.tribeId,requestId:fixture.context.requestId,challengeId:issued.result.challengeId},resolved=await resolver.resolve(intent);
      expect(resolved).toMatchObject({scope:{purpose:"admission",applicantUserId:fixture.context.userId,challengeId:intent.challengeId,tribeId:intent.tribeId,contributingLeaderUserId:fixture.fixture.userId,connectionId:fixture.fixture.scope.connectionId,connectionVersion:fixture.fixture.scope.connectionVersion},environment:fixture.fixture.config.environment,securityEpoch:fixture.fixture.config.securityEpoch});expect(resolved).not.toHaveProperty("secretRef");expect(resolved).not.toHaveProperty("recipient");expect(resolved).not.toHaveProperty("credential");
      await expect(resolver.resolve({...intent,userId:randomUUID()})).rejects.toMatchObject({code:"permission_denied"});await expect(resolver.resolve({...intent,challengeId:randomUUID()})).rejects.toMatchObject({code:"resource_unavailable"});
      await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.context.tribeId} and user_id=${fixture.fixture.userId}`));await expect(resolver.resolve(intent)).rejects.toMatchObject({code:"connection_incomplete"});await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.context.tribeId} and user_id=${fixture.fixture.userId}`));
      await database.withContext(fixture.own,(transaction)=>transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.context.sessionId}`));await expect(resolver.resolve(intent)).rejects.toMatchObject({code:"authentication_required"});
      expect(await fixture.counts()).toMatchObject({challenges:1,deliveries:1,events:1,operations:1,proofs:0,memberships:0});
    });
  },600_000);
});
