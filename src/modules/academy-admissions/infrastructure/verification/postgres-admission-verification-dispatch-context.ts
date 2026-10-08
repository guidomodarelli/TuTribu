/** Resolves one committed applicant challenge into backend-only focal resource identity without opening material or taking a lease. @module postgres-admission-verification-dispatch-context */
import "server-only";
import {sql} from "drizzle-orm";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {AdmissionChallengeDispatchIntent} from "../../domain/repositories/admission-contact-verification";
import type {AdmissionVerificationDatabaseExecutor} from "../repositories/postgres-admission-contact-verification-operations";
import type {ResolvedAdmissionChallengeDispatch} from "./admission-verification-message-sender";
import {PostgresAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import {AdmissionOperationError} from "../../domain/errors/admission-operation-error";
import {ADMISSION_ERROR_CODE} from "../../constants/admission-errors";
import {ADMISSION_VERIFICATION_PURPOSE} from "../../constants/admission-eligibility";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";

/** Consumes only immutable owner/resource/security lineage; native PostgreSQL rows are not schema-validated. */
type DispatchLineageRow={delivery_id:string;connection_id:string;connection_version:number;contributed_by_user_id:string|null;environment:string;security_epoch:string};

/** Applicant scope permits reading its committed obligation; worker authority remains separately derived and rechecked. */
export class PostgresAdmissionVerificationDispatchContext{
  /** @param execute - Native current account checkout, never a client-selected PostgreSQL principal. */
  constructor(private readonly execute:AdmissionVerificationDatabaseExecutor){}
  /** @param database - Current guarded transaction. @param intent - Native request/session/challenge identity. @returns Nothing while the actual account/session remains current after all preceding waits. */
  private async authorize(database:RequestDatabase,intent:AdmissionChallengeDispatchIntent){
    const actor=(await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
    if(actor!==intent.userId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if(!(await database.execute(sql`select id from public.tribes where id=${intent.tribeId} for share`)).rows[0])throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await database.execute(sql`select id from public."user" where id=${intent.userId} for share`);
    await database.execute(sql`select id from public.session where id=${intent.sessionId} and "userId"=${intent.userId} for share`);
    const accounts=new PostgresAuthenticatedAccountProvider(async()=>({userId:intent.userId,sessionId:intent.sessionId}),(_identity,run)=>run(database)),account=await accounts.getAuthenticatedAccount(),now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
    if(!account||account.userId!==intent.userId||account.session.id!==intent.sessionId||!isAuthenticatedSessionLive(account.session.expiresAt,now))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }
  /** @param intent - Exact confirmed own challenge, without sender, recipient, secret or contributor from the caller. @returns Private worker hint from actual challenge/delivery/resource lineage, which SQL and SecretStore must independently revalidate. */
  async resolve(intent:AdmissionChallengeDispatchIntent):Promise<ResolvedAdmissionChallengeDispatch>{
    const context={userId:intent.userId,sessionId:intent.sessionId,tribeId:intent.tribeId,requestId:intent.requestId,purpose:ADMISSION_VERIFICATION_PURPOSE.admission};
    return this.execute(context,async(database)=>{
      await this.authorize(database,intent);
      const row=(await database.execute<DispatchLineageRow>(sql`select delivery.id as delivery_id,delivery.connection_id,delivery.connection_version,connection.contributed_by_user_id,delivery.environment,delivery.security_epoch from public.contact_verification_challenges challenge join public.message_deliveries delivery on delivery.id=challenge.delivery_id and delivery.tribe_id=challenge.tribe_id and delivery.actor_user_id=challenge.user_id and delivery.source_resource_id=challenge.id and delivery.purpose=challenge.purpose and delivery.connection_id=challenge.connection_id and delivery.connection_version=challenge.connection_version and delivery.security_epoch=challenge.security_epoch join public.tenant_messaging_connections connection on connection.id=delivery.connection_id and connection.tribe_id=delivery.tribe_id where challenge.id=${intent.challengeId} and challenge.user_id=${intent.userId} and challenge.tribe_id=${intent.tribeId} and challenge.purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} for share of connection`)).rows[0];
      if(!row?.contributed_by_user_id)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const leaders=(await database.execute<{user_id:string}>(sql`select user_id from public.tribe_members where tribe_id=${intent.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
      if(leaders.length!==1||leaders[0].user_id!==row.contributed_by_user_id)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
      await this.authorize(database,intent);
      return{scope:{purpose:ADMISSION_VERIFICATION_PURPOSE.admission,applicantUserId:intent.userId,challengeId:intent.challengeId,deliveryId:row.delivery_id,tribeId:intent.tribeId,contributingLeaderUserId:row.contributed_by_user_id,connectionId:row.connection_id,connectionVersion:row.connection_version},environment:row.environment,securityEpoch:row.security_epoch};
    });
  }
}
