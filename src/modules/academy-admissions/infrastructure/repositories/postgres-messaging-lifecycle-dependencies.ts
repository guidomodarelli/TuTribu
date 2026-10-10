/** Applies admission-owned dependency and compromise effects in the caller's local lifecycle transaction. @module postgres-messaging-lifecycle-dependencies */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleContext, MessagingConnectionLifecycleDependencies } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { ADMISSION_PROOF_STATUS } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE } from "../../constants/messaging-lifecycle-evidence";
import { VERIFICATION_CHALLENGE_STATE } from "../../constants/verification-challenge";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "@/src/modules/messaging/constants/messaging-connection-security";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { VERIFICATION_DIAGNOSTIC_OUTCOME } from "@/src/modules/messaging/constants/verification-delivery";
import { MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON } from "@/src/modules/messaging/constants/messaging-connection-retirement";

/** A notification owner must supply current settings; missing/unavailable facts must throw rather than silently enable retirement. */
export type ExternalNotificationLifecycleReader=(context:MessagingConnectionLifecycleContext,database:RequestDatabase)=>Promise<boolean>;

/** Does not create policy/settings, load keys, send messages, expel members or alter invitations. */
export class PostgresMessagingLifecycleDependencies implements MessagingConnectionLifecycleDependencies{
  /** @param database - Existing native transaction holding exclusive tribe and connection locks. @param externalNotificationsEnabled - Explicit notification owner for current dependency facts. */
  constructor(private readonly database:RequestDatabase,private readonly externalNotificationsEnabled:ExternalNotificationLifecycleReader){}
  /** @param context - Current local lifecycle scope. @returns Current locked dependencies with no defaults persisted. */
  async readRetirementFacts(context:MessagingConnectionLifecycleContext){
    const policy=(await this.database.execute<{requires_additional_verification:boolean;is_open:boolean}>(sql`select requires_additional_verification,is_open from public.academy_admission_policies where tribe_id=${context.tribeId} for update`)).rows[0];
    return{verificationRequired:policy?.requires_additional_verification??false,admissionsPaused:!policy?.is_open,externalNotificationsEnabled:await this.externalNotificationsEnabled(context,this.database)};
  }
  /** @param context - Exact compromised connection under current authority. @param ledgerId - Original private local action. @returns After revoking unused and affected pending evidence while retaining admitted provenance and all consumption. */
  async invalidateCompromisedEvidence(context:MessagingConnectionLifecycleContext,ledgerId:string):Promise<void>{
    const deliveries=(await this.database.execute<{id:string}>(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`)).rows;
    // Attachment holds request before proof. The exclusive tribe fence precedes all these owner locks.
    await this.database.execute(sql`select request.id from public.academy_admission_requests request join public.academy_admission_verification_proofs proof on proof.id=request.proof_id and proof.tribe_id=request.tribe_id where request.tribe_id=${context.tribeId} and request.status=${ADMISSION_REQUEST_STATUS.pending} and proof.connection_id=${context.connectionId} order by request.id for update of request`);
    const challenges=(await this.database.execute<{id:string;code_envelope_id:string|null}>(sql`select id,code_envelope_id from public.contact_verification_challenges where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`)).rows;
    await this.database.execute(sql`select id from public.academy_admission_verification_proofs where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`);
    const now=(await this.database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now,reason=MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise;
    await this.database.execute(sql`update public.academy_admission_verification_proofs proof set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${reason} where proof.tribe_id=${context.tribeId} and proof.connection_id=${context.connectionId} and (proof.status=${ADMISSION_PROOF_STATUS.available} or proof.status=${ADMISSION_PROOF_STATUS.applied} and exists(select 1 from public.academy_admission_requests request where request.id=proof.applied_request_id and request.tribe_id=proof.tribe_id and request.status=${ADMISSION_REQUEST_STATUS.pending}))`);
    for(const challenge of challenges){
      if(challenge.code_envelope_id)await this.database.execute(sql`select id from public.verification_code_envelopes where id=${challenge.code_envelope_id} and challenge_id=${challenge.id} for update`);
      await this.database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${reason}),code_mac=null,code_envelope_id=null where id=${challenge.id} and (is_current or code_mac is not null or code_envelope_id is not null)`);
      if(challenge.code_envelope_id)await this.database.execute(sql`delete from public.verification_code_envelopes where id=${challenge.code_envelope_id} and challenge_id=${challenge.id}`);
      await this.database.execute(sql`update public.messaging_connection_diagnostics set outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.invalidated} where challenge_id=${challenge.id} and outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.pending}`);
    }
    for(const delivery of deliveries)await this.database.execute(sql`update public.message_deliveries set state=${MESSAGE_DELIVERY_STATE.cancelled},last_outcome=${reason},lease_token=null,lease_until=null,version=version+1 where id=${delivery.id} and state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=${delivery.id})`);
    await this.database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule) values (${context.tribeId},${context.actorUserId},${ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE.resourceType},${context.connectionId},${ledgerId},${ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE.compromised},${reason})`);
  }
  /** @param context - Exact ordinarily retired connection after the caller's dependency assessment. @param ledgerId - Original private local action. @returns After detaching current policy references, preserving verification epoch/rules and applied evidence. */
  async retireReferences(context:MessagingConnectionLifecycleContext,ledgerId:string):Promise<void>{
    await this.database.execute(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`);
    await this.database.execute(sql`select id from public.contact_verification_challenges where tribe_id=${context.tribeId} and connection_id=${context.connectionId} order by id for update`);
    const now=(await this.database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now;
    await this.database.execute(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON} where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and status=${ADMISSION_PROOF_STATUS.available}`);
    await this.database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${MESSAGING_CONNECTION_ORDINARY_RETIREMENT_REASON}),code_mac=null where tribe_id=${context.tribeId} and connection_id=${context.connectionId} and is_current`);
    await this.database.execute(sql`update public.academy_admission_policies set messaging_connection_id=null,messaging_connection_version=null,version=version+1,changed_by_user_id=${context.actorUserId},updated_at=clock_timestamp() where tribe_id=${context.tribeId} and messaging_connection_id=${context.connectionId}`);
    await this.database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type) values (${context.tribeId},${context.actorUserId},${ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE.resourceType},${context.connectionId},${ledgerId},${ADMISSION_MESSAGING_LIFECYCLE_EVIDENCE.retired})`);
  }
}
