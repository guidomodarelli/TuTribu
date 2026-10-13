/** @vitest-environment node */
/** Exercises native account/policy authority around real ledger, issuer and local proof consumption. @module admission-contact-verification-persistence-tests */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {describe,expect,it} from "vitest";
import {withAcademyAdmissionDatabase} from "@/tests/support/academy-admission-database";
import {prepareAdmissionContactVerification} from "@/tests/support/admission-contact-verification-fixture";
import {recoverTestVerificationCode} from "@/tests/support/contact-verification-issuance-fixture";
import {PostgresAdmissionContactVerificationOperations,type AdmissionVerificationDatabaseExecutor} from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS!=="1")("native admission contact verification operations",()=>{
  it("should reject an OFF policy before creating any challenge, request accounting, delivery or operation",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database),operations=new PostgresAdmissionContactVerificationOperations((_scope,run)=>database.withContext(fixture.own,run),async()=>fixture.fixture.config);
      await expect(operations.issue(fixture.input)).rejects.toMatchObject({code:"invalid_input"});expect(await fixture.counts()).toEqual({challenges:0,deliveries:0,events:0,operations:0,proofs:0,memberships:0});
    });
  },600_000);
  it("should deny a new billable challenge for an already active member before creating any original operation",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database,true);await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations=new PostgresAdmissionContactVerificationOperations((_scope,run)=>database.withContext(fixture.own,run),async()=>fixture.fixture.config);await expect(operations.issue({...fixture.input,expectedPolicyVersion:2})).rejects.toMatchObject({code:"admission_ineligible"});expect(await fixture.counts()).toMatchObject({challenges:0,deliveries:0,events:0,operations:0,proofs:0,memberships:1});
    });
  },600_000);
  it("should issue under the native current ON policy, replay without another code and consume locally while quota is zero and the connection is suspended",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database);await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      let loseOriginalCommit=true;
      const execute:AdmissionVerificationDatabaseExecutor=async(_scope,run)=>{const result=await database.withContext(fixture.own,run);if(loseOriginalCommit&&typeof result==="object"&&result!==null&&"state"in result&&result.state==="completed"&&"replayed"in result&&result.replayed===false){loseOriginalCommit=false;throw new Error("Synthetic applicant operation commit response lost");}return result;};
      const operations=new PostgresAdmissionContactVerificationOperations(execute,async()=>fixture.fixture.config),input={...fixture.input,expectedPolicyVersion:2},issued=await operations.issue(input);if(issued.state!=="completed")throw new Error("Expected original committed applicant challenge");
      expect(issued.result).toMatchObject({purpose:"admission",channel:"email",deliveryState:"queued"});expect(issued.result.maskedDestination===fixture.input.contact.value).toBe(false);expect(await operations.issue(input)).toEqual({...issued,replayed:true});expect(await fixture.counts()).toEqual({challenges:1,deliveries:1,events:1,operations:1,proofs:0,memberships:0});
      const scope={...fixture.fixture.scope,userId:fixture.context.userId,contact:fixture.input.contact,verificationEpoch:2},codeFixture={...fixture.fixture,own:fixture.own,scope},recovered=await recoverTestVerificationCode(database,codeFixture,issued.result.challengeId);
      await database.withContext(fixture.fixture.own,async(transaction)=>{await transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.context.tribeId}`);await transaction.execute(sql`update public.tenant_messaging_connections set state='suspended',state_reason='security_pause',version=version+1 where id=${fixture.fixture.scope.connectionId}`);});
      const verification={...fixture.context,operationId:randomUUID(),challengeId:issued.result.challengeId,verificationCode:recovered.code},verified=await operations.verify(verification);expect(verified).toMatchObject({state:"completed",result:{purpose:"admission",result:"verified",proofId:expect.any(String)}});expect(await operations.verify(verification)).toEqual({...verified,replayed:true});expect(await fixture.counts()).toMatchObject({challenges:1,deliveries:1,events:1,operations:2,proofs:1,memberships:0});
    });
  },600_000);
  it("should commit incorrect-code accounting once per original operation without a proof or another delivery",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareAdmissionContactVerification(database);await database.withContext(fixture.fixture.own,(transaction)=>transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations=new PostgresAdmissionContactVerificationOperations((_scope,run)=>database.withContext(fixture.own,run),async()=>fixture.fixture.config),issued=await operations.issue({...fixture.input,expectedPolicyVersion:2});if(issued.state!=="completed")throw new Error("Expected current applicant code");
      const scope={...fixture.fixture.scope,userId:fixture.context.userId,contact:fixture.input.contact,verificationEpoch:2},recovered=await recoverTestVerificationCode(database,{...fixture.fixture,own:fixture.own,scope},issued.result.challengeId),input={...fixture.context,operationId:randomUUID(),challengeId:issued.result.challengeId,verificationCode:recovered.code==="000000"?"111111":"000000"},first=await operations.verify(input);
      expect(first).toMatchObject({state:"completed",result:{purpose:"admission",result:"denied",code:"verification_code_incorrect"}});expect(await operations.verify(input)).toEqual({...first,replayed:true});expect(await fixture.counts()).toMatchObject({challenges:1,deliveries:1,events:2,operations:2,proofs:0,memberships:0});
      const stored=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state,failed_attempts,code_mac is not null as has_mac from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows[0]);expect(stored).toEqual({state:"issued",failed_attempts:1,has_mac:true});
      const lineage=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select count(*)::int as count from public.messaging_usage_events event join public.academy_admission_operations operation on operation.id=event.operation_id and operation.actor_user_id=event.actor_user_id and operation.tribe_id=event.tribe_id where event.actor_user_id=${fixture.context.userId} and event.challenge_id=${issued.result.challengeId} and event.event_type='code_failure' and operation.idempotency_key=${input.operationId}`)).rows);expect(lineage).toEqual([{count:1}]);
      for(let attempt=1;attempt<5;attempt+=1)expect(await operations.verify({...input,operationId:randomUUID()})).toMatchObject({state:"completed",result:{result:"denied",code:"verification_code_incorrect"}});
      expect(await operations.verify({...input,operationId:randomUUID(),verificationCode:recovered.code})).toMatchObject({state:"completed",result:{result:"denied",code:"verification_attempts_exceeded"}});
      const exhausted=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute(sql`select state,failed_attempts,code_mac is not null as has_mac,code_envelope_id from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows[0]);expect(exhausted).toEqual({state:"invalidated",failed_attempts:5,has_mac:false,code_envelope_id:null});expect(await fixture.counts()).toMatchObject({challenges:1,deliveries:1,events:6,proofs:0,memberships:0});
    });
  },600_000);
});
