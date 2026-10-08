/** Seeds native applicant identity beside an existing protected production resource on an owned SQL branch. @module admission-contact-verification-fixture */
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type {AcademyAdmissionTestDatabase} from "./academy-admission-database";
import {prepareContactVerificationIssuer} from "./contact-verification-issuance-fixture";
import type {AdmissionChallengeIssuanceIntent} from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";

/** @param database - Exact owned disposable branch. @param memberBeforeActivation - Optional legitimate basic membership seeded before the protected cutover, for new-code denial scenarios. @returns Native applicant/session, actual resource/config and an OFF policy with a controlled protected fixture marker. */
export async function prepareAdmissionContactVerification(database:AcademyAdmissionTestDatabase,memberBeforeActivation=false){
  const fixture=await prepareContactVerificationIssuer(database);await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  const userId=randomUUID(),sessionId=randomUUID(),accountId=randomUUID(),subject=randomUUID(),email=`${userId}@example.test`,own={userId,email};
  await database.withContext(fixture.own,async(transaction)=>{
    const now=new Date((await transaction.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic verification applicant',${email},false,${now},${now})`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
    if(memberBeforeActivation)await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.scope.tribeId},${userId},'tribemate','active')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.scope.tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,is_open,activated_at,messaging_connection_id,messaging_connection_version) values (${fixture.scope.tribeId},true,${now},${fixture.scope.connectionId},${fixture.scope.connectionVersion})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${fixture.scope.tribeId}`);
  });
  const context={userId,sessionId,tribeId:fixture.scope.tribeId,requestId:randomUUID(),purpose:"admission"as const};
  const input:AdmissionChallengeIssuanceIntent={...context,operationId:randomUUID(),expectedPolicyVersion:1,confirmed:true,contact:{type:"email",value:email},channel:"email",admissionRequestId:null,source:{kind:"common"}};
  /** @returns Only counts of observable effects, without contact/code/credential or private native identity data. */
  const counts=()=>database.withContext(own,async(transaction)=>(await transaction.execute(sql`select (select count(*)::int from public.contact_verification_challenges where tribe_id=${context.tribeId} and user_id=${userId}) as challenges,(select count(*)::int from public.message_deliveries where tribe_id=${context.tribeId} and actor_user_id=${userId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${context.tribeId} and actor_user_id=${userId}) as events,(select count(*)::int from public.academy_admission_operations where tribe_id=${context.tribeId} and actor_user_id=${userId}) as operations,(select count(*)::int from public.academy_admission_verification_proofs where tribe_id=${context.tribeId} and user_id=${userId}) as proofs,(select count(*)::int from public.tribe_members where tribe_id=${context.tribeId} and user_id=${userId}) as memberships`)).rows[0]);
  return{fixture,own,context,input,counts};
}
