/** Keeps admission policy/evidence ownership when messaging atomically replaces the selected effective resource. @module postgres-messaging-selection-dependencies */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {MessagingSelectionDependencies,MessagingEffectiveSelection} from "@/src/modules/messaging/domain/repositories/messaging-connection-activation";
import type {AuthorizedMessagingContext} from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import {AdmissionOperationError} from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "@/src/modules/academy-admissions/constants/admission-errors";
import {ADMISSION_CONTACT_TYPE} from "@/src/modules/academy-admissions/constants/admission-contact";
import {ADMISSION_PROOF_STATUS,ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {VERIFICATION_CHALLENGE_STATE} from "@/src/modules/academy-admissions/constants/verification-challenge";
import {ADMISSION_AUDIT_RESOURCE_TYPE} from "@/src/modules/academy-admissions/constants/admission-audit";
import {ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT} from "@/src/modules/academy-admissions/constants/admission-proof";
import {ADMISSION_MESSAGING_SELECTION_CHANGE} from "@/src/modules/academy-admissions/constants/messaging-selection";
import {createAdmissionMessagingSelectionAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-audit-event";
import {createAdmissionResourceAuditEvent} from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {PostgresAdmissionAuditRepository} from "./postgres-admission-audit-repository";

/** Only consumed policy dependency fields are read; no backend schema revalidation or mutable country copy. */
type PolicySelection={version:number;verification_epoch:number;requires_additional_verification:boolean;contact_type:"email"|"phone";phone_channel:"sms"|"whatsapp"|null;allow_sms_alternative:boolean;messaging_connection_id:string|null;messaging_connection_version:number|null};
/** Notifications owns its current enabled flag; unavailable facts must throw rather than silently permit an incomplete selection. */
export type MessagingSelectionNotificationReader=(context:AuthorizedMessagingContext,database:RequestDatabase)=>Promise<boolean>;
/** Bound to the original activation transaction; this adapter never acquires another checkout or changes policy flags/rules. */
export class PostgresMessagingSelectionDependencies implements MessagingSelectionDependencies{
  /** @param database - Existing protected transaction with exclusive tribe/current activation authority held by the caller. @param notificationsEnabled - Explicit owner reader for current independent email settings, without another checkout. */
  constructor(private readonly database:RequestDatabase,private readonly notificationsEnabled:MessagingSelectionNotificationReader){}
  /** @param tribeId - Exact currently authorized scope. @returns Locked current dependency facts or absence, without initialization. */
  private async policy(tribeId:string):Promise<PolicySelection|undefined>{return(await this.database.execute<PolicySelection>(sql`select version,verification_epoch,requires_additional_verification,contact_type,phone_channel,allow_sms_alternative,messaging_connection_id,messaging_connection_version from public.academy_admission_policies where tribe_id=${tribeId} for update`)).rows[0];}
  /** @param context - Current native activation. @returns Union of current admission and independent notification channels, without initializing or enabling settings. */
  async requiredChannels(context:AuthorizedMessagingContext):Promise<readonly ("email"|"sms"|"whatsapp")[]>{
    const policy=await this.policy(context.tribeId),channels=new Set<"email"|"sms"|"whatsapp">();
    if(policy?.requires_additional_verification){
      if(policy.contact_type===ADMISSION_CONTACT_TYPE.email)channels.add(MESSAGING_PUBLIC_CHANNEL.email);
      else{if(policy.phone_channel!==MESSAGING_PUBLIC_CHANNEL.sms&&policy.phone_channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);channels.add(policy.phone_channel);if(policy.allow_sms_alternative)channels.add(MESSAGING_PUBLIC_CHANNEL.sms);}
    }
    if(await this.notificationsEnabled(context,this.database))channels.add(MESSAGING_PUBLIC_CHANNEL.email);
    return[...channels];
  }
  /** @param context - Actual current activation principal. @param previous - Old selected immutable scope. @param next - Prepared replacement. @param ledgerId - Private original operation audit identity. @returns Current policy counter after reference-only change, preserving flags/epoch and applied proof provenance. */
  async replaceSelection(context:AuthorizedMessagingContext,previous:MessagingEffectiveSelection|null,next:MessagingEffectiveSelection,ledgerId:string):Promise<number|null>{
    const policy=await this.policy(context.tribeId);
    if(previous){
      // Every old delivery is held before its challenge, matching resend, dispatch and material purge.
      await this.database.execute(sql`select id from public.message_deliveries where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} order by id for update`);
      const challenges=(await this.database.execute<{id:string;channel:"email"|"sms"|"whatsapp"}>(sql`select id,channel from public.contact_verification_challenges where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} and purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} order by id for update`)).rows;
      const channels=new Map(challenges.map((challenge)=>[challenge.id,challenge.channel]));
      const now=new Date((await this.database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      const retiredProofs=(await this.database.execute<{id:string;challenge_id:string;verification_epoch:number;applied_request_id:string|null;invalidated_at:Date|string}>(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${ADMISSION_MESSAGING_SELECTION_CHANGE.reason} where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} and status=${ADMISSION_PROOF_STATUS.available} returning id,challenge_id,verification_epoch,applied_request_id,invalidated_at`)).rows;
      await this.database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${ADMISSION_MESSAGING_SELECTION_CHANGE.reason}),code_mac=null,code_envelope_id=null where tribe_id=${context.tribeId} and connection_id=${previous.connectionId} and connection_version=${previous.connectionVersion} and purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} and is_current`);
      const events=retiredProofs.map((proof)=>{
        const channel=channels.get(proof.challenge_id);if(channel===undefined)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        return createAdmissionResourceAuditEvent({resourceType:ADMISSION_AUDIT_RESOURCE_TYPE.proof,eventType:ADMISSION_PROOF_INVALIDATION_AUDIT_EVENT,tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:ledgerId,resourceId:proof.id,resourceVersion:null,rule:ADMISSION_MESSAGING_SELECTION_CHANGE.reason,cause:ADMISSION_MESSAGING_SELECTION_CHANGE.reason,createdAt:new Date(proof.invalidated_at),metadata:{fromState:ADMISSION_PROOF_STATUS.available,toState:ADMISSION_PROOF_STATUS.invalid,challengeId:proof.challenge_id,requestId:proof.applied_request_id,verificationEpoch:proof.verification_epoch,channel}});
      });
      await new PostgresAdmissionAuditRepository(this.database).appendMany(events);
    }
    if(!policy)return null;
    const referencesPrevious=previous&&policy.messaging_connection_id===previous.connectionId&&policy.messaging_connection_version===previous.connectionVersion;
    if(!referencesPrevious)return policy.version;
    const policyChangedAt=new Date((await this.database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    const changed=(await this.database.execute<{version:number;updated_at:Date|string}>(sql`update public.academy_admission_policies set messaging_connection_id=${next.connectionId},messaging_connection_version=${next.connectionVersion},version=version+1,changed_by_user_id=${context.actorUserId},updated_at=${policyChangedAt} where tribe_id=${context.tribeId} and version=${policy.version} returning version,updated_at`)).rows[0];
    if(!changed)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    await new PostgresAdmissionAuditRepository(this.database).append(createAdmissionMessagingSelectionAuditEvent({tribeId:context.tribeId,actorUserId:context.actorUserId,operationId:ledgerId,resourceVersion:changed.version,previousVersion:policy.version,previousConnectionId:previous.connectionId,previousConnectionVersion:previous.connectionVersion,connectionId:next.connectionId,connectionVersion:next.connectionVersion,verificationEpoch:policy.verification_epoch,createdAt:new Date(changed.updated_at)}));
    return changed.version;
  }
}
