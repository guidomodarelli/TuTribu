/** Seeds trusted historical selection, evidence and charged deliveries on an owned SQL branch. @module messaging-selection-fixture */
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type {AcademyAdmissionTestDatabase} from "./academy-admission-database";
import type {prepareMessagingConnectionCreation} from "./messaging-connection-fixture";

/** @param database - Owned isolated branch. @param fixture - Actual encrypted creation owner and native principal. @param candidateId - Locally diagnosed replacement. @returns Historical IDs and safe snapshots; plaintext remains private to creation. */
export async function seedPreviousMessagingSelection(database:AcademyAdmissionTestDatabase,fixture:Awaited<ReturnType<typeof prepareMessagingConnectionCreation>>,candidateId:string){
  const {tribeId}=fixture.context,own=fixture.fixture.own;
  await database.withContext(own,(transaction)=>transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false where id=${candidateId}`));
  const created=await fixture.repository.create(fixture.context,{operationId:randomUUID(),confirmed:true,providerId:"zavu",name:"Conexión anterior",apiKey:randomUUID()});
  if(created.state!=="completed")throw new Error("Expected encrypted historical selection");
  const connectionId=created.result.id,requestId=randomUUID(),used={userId:randomUUID(),challengeId:randomUUID(),proofId:randomUUID(),deliveryId:randomUUID()},unused={userId:randomUUID(),challengeId:randomUUID(),proofId:randomUUID(),deliveryId:randomUUID()},acceptedDeliveryId=randomUUID(),unknownDeliveryId=randomUUID();
  await database.withContext(own,async(transaction)=>{
    await transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=false,candidate_version=null,is_selected=true,selected_version=1,state='active' where id=${connectionId}`);
    await transaction.execute(sql`update public.tenant_messaging_connections set is_candidate=true where id=${candidateId}`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,version,verification_epoch,requires_additional_verification,is_open,messaging_connection_id,messaging_connection_version) values (${tribeId},7,5,false,false,${connectionId},1)`);
    const now=new Date((await transaction.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now),expiresAt=new Date(now.getTime()+600_000),applyBefore=new Date(now.getTime()+900_000);
    for(const evidence of[used,unused]){
      const contact=`${evidence.userId}@example.test`;
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${evidence.userId},'Synthetic historical applicant',${contact},false,${now},${now})`);
      await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${evidence.deliveryId},${tribeId},${connectionId},1,${fixture.fixture.config.environment},${fixture.fixture.config.securityEpoch},'admission',${evidence.challengeId},${evidence.userId},${evidence.challengeId},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${now},${now},${expiresAt})`);
      await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,state,is_current,created_at,expires_at,verified_at,code_mac,mac_key_id,delivery_id) values (${evidence.challengeId},${evidence.userId},${tribeId},'email',${contact},${randomBytes(32)},'synthetic-contact','admission',5,${connectionId},1,${fixture.fixture.config.securityEpoch},'email','verified',true,${now},${expiresAt},${now},null,'synthetic-mac',${evidence.deliveryId})`);
      await transaction.execute(sql`insert into public.academy_admission_verification_proofs(id,challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before) values (${evidence.proofId},${evidence.challengeId},${evidence.userId},${tribeId},'email',${contact},5,${connectionId},1,${fixture.fixture.config.securityEpoch},${now},${applyBefore})`);
    }
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) values (${requestId},${tribeId},${used.userId},'common','email',${`${used.userId}@example.test`},'declared',${now},${now}::timestamptz+interval '30 days')`);
    await transaction.execute(sql`update public.academy_admission_requests set proof_id=${used.proofId},evidence_source='local',version=version+1 where id=${requestId}`);
    await transaction.execute(sql`update public.academy_admission_verification_proofs set status='applied',applied_request_id=${requestId},applied_at=clock_timestamp() where id=${used.proofId}`);
    for(const [deliveryId,state] of[[acceptedDeliveryId,"accepted"],[unknownDeliveryId,"unknown"]] as const){
      const attemptId=randomUUID(),reservationId=randomUUID(),sourceId=randomUUID();
      await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,state,created_at,due_at,deadline_at) values (${deliveryId},${tribeId},${connectionId},1,${fixture.fixture.config.environment},${fixture.fixture.config.securityEpoch},'admission_notification',${sourceId},${fixture.context.actorUserId},${sourceId},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${state},${now},${now},${expiresAt})`);
      await transaction.execute(sql`insert into public.message_delivery_attempts(id,delivery_id,tribe_id,connection_id,connection_version,sequence,reservation_id,lease_token,send_authorized_at,authorized_usage_policy_version,state) values (${attemptId},${deliveryId},${tribeId},${connectionId},1,1,${reservationId},${randomUUID()},${now},1,${state})`);
      await transaction.execute(sql`insert into public.messaging_usage_reservations(id,tribe_id,attempt_id,delivery_id,category,reserved_at) values (${reservationId},${tribeId},${attemptId},${deliveryId},'notification',${now})`);
    }
  });
  /** @returns Safe metadata for rollback and preserved history; never credential bytes or recipient values. */
  const snapshot=()=>database.withContext(own,async(transaction)=>({
    connections:(await transaction.execute(sql`select id,version,state,is_selected,is_candidate,selected_version,candidate_version,retired_at from public.tenant_messaging_connections where tribe_id=${tribeId} order by id`)).rows,
    versions:(await transaction.execute(sql`select connection_id,version,retired_at,purge_after from public.messaging_connection_versions where tribe_id=${tribeId} order by connection_id,version`)).rows,
    secrets:(await transaction.execute(sql`select connection_id,connection_version,retired_at,purge_after from public.messaging_secret_envelopes where tribe_id=${tribeId} order by connection_id,connection_version`)).rows,
    policy:(await transaction.execute(sql`select version,verification_epoch,mode,is_open,requires_additional_verification,allow_common_exceptions,messaging_connection_id,messaging_connection_version from public.academy_admission_policies where tribe_id=${tribeId}`)).rows[0],
    proofs:(await transaction.execute(sql`select id,status,connection_id,connection_version,verification_epoch,applied_request_id,applied_at,invalidated_at,invalidation_reason from public.academy_admission_verification_proofs where tribe_id=${tribeId} order by id`)).rows,
    challenges:(await transaction.execute(sql`select id,state,is_current,version,invalidated_at,invalidation_reason from public.contact_verification_challenges where tribe_id=${tribeId} and connection_id=${connectionId} order by id`)).rows,
    request:(await transaction.execute(sql`select status,submitted_at,expires_at,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows[0],
    deliveries:(await transaction.execute(sql`select id,state,version,connection_id,connection_version,last_outcome from public.message_deliveries where tribe_id=${tribeId} order by id`)).rows,
    reservations:(await transaction.execute(sql`select id,delivery_id,state,reserved_at,released_at from public.messaging_usage_reservations where tribe_id=${tribeId} order by id`)).rows,
    usage:(await transaction.execute(sql`select version,verification_daily_limit,notification_daily_limit,allowed_countries from public.messaging_usage_policies where tribe_id=${tribeId}`)).rows[0],
  }));
  return{connectionId,requestId,used,unused,acceptedDeliveryId,unknownDeliveryId,snapshot};
}
