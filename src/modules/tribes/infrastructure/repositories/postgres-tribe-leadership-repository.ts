/** Commits canonical role transfer, structural messaging suspension and its original ledger result without retrieving any key. @module postgres-tribe-leadership-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { TribeLeadershipTransferContext, TribeLeadershipTransferInput, TribeLeadershipWriter } from "../../domain/repositories/tribe-leadership-repository";
import { tribeLeadershipTransferResultSchema } from "../../application/results/tribe-leadership-transfer-result";
import { TribeLeadershipOperationError } from "../../domain/errors/tribe-leadership-operation-error";
import { TRIBE_FORMER_LEADER_ROLE, TRIBE_LEADERSHIP_ERROR_CODE, TRIBE_LEADERSHIP_OPERATION } from "../../constants/tribe-leadership";
import { TRIBE_MEMBER_ROLE } from "../../constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "../../constants/tribe-page-access";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Each phase uses the same actual request actor; no public input selects a principal or creates nested transactions. */
export type TribeLeadershipDatabaseExecutor=<Result>(context:TribeLeadershipTransferContext,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;

/** Original result observation survives the intentional loss of leader role; fresh effects always require the current canonical leader. */
export class PostgresTribeLeadershipRepository implements TribeLeadershipWriter{
  /** @param execute - Native actor's protected database phases. @param readSecurityConfig - Independent operation MAC snapshot; no provider or SecretStore participates. */
  constructor(private readonly execute:TribeLeadershipDatabaseExecutor,private readonly readSecurityConfig:()=>Promise<MessagingSecurityConfig>){}
  /** @param database - Existing actor transaction. @param context - Native scope. @returns After identity, session lifetime and the common tribe fence remain current. */
  private async authorizeIdentity(database:RequestDatabase,context:TribeLeadershipTransferContext):Promise<void>{
    const actor=(await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;if(actor!==context.actorUserId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    await database.execute(sql`select id from public."user" where id=${context.actorUserId} for share`);
    const session=(await database.execute<{expires_at:Date|string}>(sql`select "expiresAt" as expires_at from public.session where id=${context.sessionId} and "userId"=${context.actorUserId} for share`)).rows[0];if(!session)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if(!(await database.execute(sql`select id from public.tribes where id=${context.tribeId} for update`)).rows[0])throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const now=new Date((await database.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);if(!Number.isFinite(now.getTime())||!Number.isFinite(new Date(session.expires_at).getTime())||new Date(session.expires_at)<=now)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }
  /** @param database - Same fenced actor transaction. @param context - Native scope. @param input - Exact confirmed original. @returns After current canonical leader and existing target remain eligible, sampled after row waits. */
  private async authorizeChange(database:RequestDatabase,context:TribeLeadershipTransferContext,input:TribeLeadershipTransferInput):Promise<void>{
    await this.authorizeIdentity(database,context);
    const members=(await database.execute<{user_id:string;role:string;status:string}>(sql`select user_id,role,status from public.tribe_members where tribe_id=${context.tribeId} and (role=${TRIBE_MEMBER_ROLE.leader} or user_id in (${context.actorUserId},${input.nextLeaderUserId})) order by user_id for update`)).rows,leaders=members.filter((member)=>member.role===TRIBE_MEMBER_ROLE.leader&&member.status===TRIBE_MEMBERSHIP_STATUS.active),target=members.find((member)=>member.user_id===input.nextLeaderUserId);
    if(leaders.length!==1||leaders[0].user_id!==context.actorUserId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if(input.expectedLeaderUserId!==context.actorUserId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionConflict);
    if(!target||target.status!==TRIBE_MEMBERSHIP_STATUS.active||!TRIBE_FORMER_LEADER_ROLE.some((role)=>role===target.role))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await this.authorizeIdentity(database,context);
  }
  /** @param context - Actual native actor/session/tribe. @param input - Confirmed original transfer. @returns The immutable original or genuine unfinished work, preserving replay after role loss. @throws TribeLeadershipOperationError with closed code and private cause. */
  async transfer(context:TribeLeadershipTransferContext,input:TribeLeadershipTransferInput){
    const command={actorUserId:context.actorUserId,tribeId:context.tribeId,operationType:TRIBE_LEADERSHIP_OPERATION,idempotencyKey:input.operationId,intent:{expectedLeaderUserId:input.expectedLeaderUserId,nextLeaderUserId:input.nextLeaderUserId,formerLeaderRole:input.formerLeaderRole,confirmed:input.confirmed}},ledger=new PostgresAdmissionOperationRepository((run)=>this.execute(context,run),async(database)=>{await this.authorizeIdentity(database,context);return true;},this.readSecurityConfig);
    try{
      if(!input.confirmed||input.nextLeaderUserId===context.actorUserId||!TRIBE_FORMER_LEADER_ROLE.includes(input.formerLeaderRole))throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const original=await ledger.read(command,tribeLeadershipTransferResultSchema);if(original?.state===OPERATION_STATE.completed)return original;
      await this.execute(context,(database)=>this.authorizeChange(database,context,input));
      return await ledger.run(command,tribeLeadershipTransferResultSchema,async(database)=>{
        await this.authorizeChange(database,context,input);
        const previousConnections=(await database.execute<{id:string}>(sql`select id from public.tenant_messaging_connections where tribe_id=${context.tribeId} and retired_at is null and state in (${MESSAGING_CONNECTION_STATE.draft},${MESSAGING_CONNECTION_STATE.ready},${MESSAGING_CONNECTION_STATE.active},${MESSAGING_CONNECTION_STATE.degraded}) order by id for update`)).rows;
        await database.execute(sql`update public.tribe_members set role=${input.formerLeaderRole} where tribe_id=${context.tribeId} and user_id=${context.actorUserId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active}`);
        await database.execute(sql`update public.tribe_members set role=${TRIBE_MEMBER_ROLE.leader} where tribe_id=${context.tribeId} and user_id=${input.nextLeaderUserId} and status=${TRIBE_MEMBERSHIP_STATUS.active}`);
        const effectiveLeaders=(await database.execute<{user_id:string}>(sql`select user_id from public.tribe_members where tribe_id=${context.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active}`)).rows;
        if(effectiveLeaders.length!==1||effectiveLeaders[0].user_id!==input.nextLeaderUserId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure,{cause:new Error("TribeLeadership.transfer failed: canonical role changes were not applied")});
        const previousConnectionIds=previousConnections.map((connection)=>connection.id),suspendedConnections=previousConnectionIds.length?(await database.execute<{id:string}>(sql`select id from public.tenant_messaging_connections where tribe_id=${context.tribeId} and id=any(${sql.param(previousConnectionIds)}::uuid[]) and state=${MESSAGING_CONNECTION_STATE.suspended}`)).rows:[];
        if(suspendedConnections.length!==previousConnectionIds.length)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.unexpectedFailure,{cause:new Error("TribeLeadership.transfer failed: required structural messaging suspension was not applied")});
        await this.authorizeIdentity(database,context);
        return{previousLeaderUserId:context.actorUserId,leaderUserId:input.nextLeaderUserId,formerLeaderRole:input.formerLeaderRole,suspendedConnectionIds:previousConnectionIds};
      });
    }catch(error){
      if(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId===input.operationId){try{const original=await ledger.read(command,tribeLeadershipTransferResultSchema);if(original?.state===OPERATION_STATE.completed)return original;}catch(recoveryError){const cause=new AggregateError([error,recoveryError],"Tribe leadership original could not be read",{cause:recoveryError});if(recoveryError instanceof AdmissionOperationError&&(recoveryError.code===ADMISSION_ERROR_CODE.authenticationRequired||recoveryError.code===ADMISSION_ERROR_CODE.permissionDenied))throw new TribeLeadershipOperationError(recoveryError.code,{cause});throw new TribeLeadershipOperationError(TRIBE_LEADERSHIP_ERROR_CODE.operationUnresolved,{cause,operationId:input.operationId});}}
      const code=error instanceof AdmissionOperationError?(error.code===ADMISSION_ERROR_CODE.connectionConflict?TRIBE_LEADERSHIP_ERROR_CODE.leadershipConflict:Object.values(TRIBE_LEADERSHIP_ERROR_CODE).find((candidate)=>candidate===error.code)??TRIBE_LEADERSHIP_ERROR_CODE.unexpectedFailure):TRIBE_LEADERSHIP_ERROR_CODE.unexpectedFailure;
      throw new TribeLeadershipOperationError(code,{cause:error,...(error instanceof AdmissionOperationError&&error.code===ADMISSION_ERROR_CODE.operationUnresolved&&error.operationId===input.operationId?{operationId:input.operationId}:{})});
    }
  }
}
