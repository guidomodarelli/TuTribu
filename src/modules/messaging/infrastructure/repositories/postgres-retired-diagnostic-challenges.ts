/** Retires diagnostic challenges of an edited configuration while retaining selected resources, delivery accounting and verified history. @module postgres-retired-diagnostic-challenges */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {VERIFICATION_CHALLENGE_STATE} from "@/src/modules/academy-admissions/constants/verification-challenge";
import {VERIFICATION_DIAGNOSTIC_OUTCOME} from "@/src/modules/messaging/constants/verification-delivery";
import {MESSAGE_DELIVERY_STATE} from "@/src/modules/messaging/constants/message-delivery";
import {MESSAGING_CONNECTION_REPLACEMENT} from "@/src/modules/messaging/constants/messaging-connection-replacement";

/** Exact immutable resource scope already protected by the configuration owner's exclusive tribe lock. */
type RetiredDiagnosticScope={tribeId:string;connectionId:string;connectionVersion:number};

/**
 * Releases the current diagnostic namespace without sending or altering any admission proof.
 * @param database - Existing authorized configuration transaction holding the exclusive tribe lock.
 * @param scope - Exact edited version; its selected configuration and historical capabilities remain untouched.
 * @returns Nothing after locking delivery → challenge → envelope and retiring transient diagnostic material.
 */
export async function retireDiagnosticChallenges(database:RequestDatabase,scope:RetiredDiagnosticScope):Promise<void>{
  const deliveries=(await database.execute<{id:string}>(sql`select delivery.id from public.message_deliveries delivery join public.contact_verification_challenges challenge on challenge.delivery_id=delivery.id and challenge.tribe_id=delivery.tribe_id where challenge.tribe_id=${scope.tribeId} and challenge.connection_id=${scope.connectionId} and challenge.connection_version=${scope.connectionVersion} and challenge.purpose=${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic} and challenge.is_current order by delivery.id for update of delivery`)).rows;
  for(const delivery of deliveries){
    const challenge=(await database.execute<{id:string;version:number;code_envelope_id:string|null}>(sql`select id,version,code_envelope_id from public.contact_verification_challenges where delivery_id=${delivery.id} and tribe_id=${scope.tribeId} and connection_id=${scope.connectionId} and connection_version=${scope.connectionVersion} and purpose=${ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic} and is_current for update`)).rows[0];
    if(!challenge)continue;
    if(challenge.code_envelope_id)await database.execute(sql`select id from public.verification_code_envelopes where id=${challenge.code_envelope_id} and challenge_id=${challenge.id} for update`);
    const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    await database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${MESSAGING_CONNECTION_REPLACEMENT.reason}),code_mac=null,code_envelope_id=null where id=${challenge.id} and version=${challenge.version}`);
    if(challenge.code_envelope_id)await database.execute(sql`delete from public.verification_code_envelopes where id=${challenge.code_envelope_id} and challenge_id=${challenge.id}`);
    await database.execute(sql`update public.message_deliveries set state=${MESSAGE_DELIVERY_STATE.cancelled},last_outcome=${MESSAGING_CONNECTION_REPLACEMENT.reason},lease_token=null,lease_until=null,version=version+1 where id=${delivery.id} and state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=${delivery.id})`);
    await database.execute(sql`update public.messaging_connection_diagnostics set outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.invalidated} where challenge_id=${challenge.id} and outcome=${VERIFICATION_DIAGNOSTIC_OUTCOME.pending}`);
  }
}
