/** Commits global nonce consumption and signed recency under current identity/resource locks. */
import "server-only";
import {sql} from "drizzle-orm";
import {GLOBAL_REAUTHENTICATION_INTENT_STATE,GLOBAL_REAUTHENTICATION_OUTCOME,RECENT_AUTHENTICATION_WINDOW_MS} from "@/src/modules/auth/constants/recent-authentication";
import {GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
import type {GlobalReauthenticationIntent} from "@/src/modules/auth/domain/entities/global-reauthentication-intent";
import type {RecentAuthenticationEvidence,RecentAuthenticationScope} from "@/src/modules/auth/domain/entities/recent-authentication-evidence";
import type {CompleteGlobalReauthenticationCommand,CreateReauthenticationIntentCommand,IssueReauthenticationNonceCommand,ReauthenticationResourceAuthorizer,RecentAuthenticationRepository} from "@/src/modules/auth/domain/repositories/recent-authentication-repository";
import {evaluateGlobalReauthenticationCallback,evaluateRecentAuthentication} from "@/src/modules/auth/domain/policies/recent-authentication";
import {issueGlobalReauthenticationNonce,matchesGlobalReauthenticationNonce} from "@/src/modules/auth/infrastructure/verification/global-reauthentication-nonce";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {TRIBE_MEMBERSHIP_STATUS} from "@/src/modules/tribes/constants/tribe-page-access";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Uses the existing guard; collaborators may perform owned SQL reads but no RPC. */
type DatabaseExecutor=<Result>(run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
type IntentRow={id:string;user_id:string;original_session_id:string;account_id:string;provider_subject:string;tribe_id:string;operation:string;resource_id:string;return_path:string;nonce_hash:Uint8Array|null;state:GlobalReauthenticationIntent["status"];version:number;created_at:string;expires_at:string;consumed_at:string|null};
/** Session expiry stays immutable under the already held row locks. */
type LockedReauthenticationContext={normalizedEmail:string;originalSessionExpiresAt:Date;effectiveSessionExpiresAt:Date};

/** Projects private intent fields without any provider payload or token. */
function mapIntent(row:IntentRow):GlobalReauthenticationIntent {
  return {id:row.id,userId:row.user_id,originalSessionId:row.original_session_id,accountId:row.account_id,subject:row.provider_subject,tribeId:row.tribe_id,operation:row.operation,resourceId:row.resource_id,returnPath:row.return_path,nonceHash:row.nonce_hash,status:row.state,version:row.version,createdAt:new Date(row.created_at),expiresAt:new Date(row.expires_at),consumedAt:row.consumed_at?new Date(row.consumed_at):null};
}

/** Obtains the authoritative clock after all preceding waits and local crypto. */
async function readClock(database:RequestDatabase):Promise<Date> {
  return new Date((await database.execute<{now:string}>(sql`select clock_timestamp() as now`)).rows[0].now);
}

/**
 * Locks global identity, both session instances, tribe and its canonical active leader.
 * @param database - Existing guarded transaction.
 * @param scope - Current account and effective session/operation/resource.
 * @param originalSessionId - Session that authorized the intent before OAuth.
 * @returns Locked email/session facts, or null without permission to continue.
 */
async function lockCurrentContext(database:RequestDatabase,scope:RecentAuthenticationScope,originalSessionId=scope.sessionId):Promise<LockedReauthenticationContext|null> {
  const actor=(await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  if(actor!==scope.userId) return null;
  const user=(await database.execute<{email:string}>(sql`select email from public."user" where id=${scope.userId} for share`)).rows[0];
  const account=(await database.execute<{subject:string}>(sql`select "accountId" as subject from public.account where id=${scope.accountId} and "userId"=${scope.userId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for share`)).rows[0];
  const sessions=(await database.execute<{id:string;expires_at:string}>(sql`select id,"expiresAt" as expires_at from public.session where "userId"=${scope.userId} and id in (${originalSessionId},${scope.sessionId}) order by id for share`)).rows;
  const originalSession=sessions.find((session)=>session.id===originalSessionId);
  const effectiveSession=sessions.find((session)=>session.id===scope.sessionId);
  if(!user||account?.subject!==scope.subject||!originalSession||!effectiveSession) return null;
  const tribe=(await database.execute<{id:string}>(sql`select id from public.tribes where id=${scope.tribeId} for share`)).rows[0];
  if(!tribe) return null;
  const leaders=(await database.execute<{user_id:string}>(sql`select user_id from public.tribe_members where tribe_id=${scope.tribeId} and role=${TRIBE_MEMBER_ROLE.leader} and status=${TRIBE_MEMBERSHIP_STATUS.active} order by user_id for share`)).rows;
  return leaders.length===1&&leaders[0].user_id===scope.userId?{normalizedEmail:user.email.trim().toLowerCase(),originalSessionExpiresAt:new Date(originalSession.expires_at),effectiveSessionExpiresAt:new Date(effectiveSession.expires_at)}:null;
}

/** Checks both locked lifetimes against the final authoritative clock without another await. */
function sessionsRemainLive(context:LockedReauthenticationContext,now:Date):boolean {
  return now.getTime()<context.originalSessionExpiresAt.getTime()&&now.getTime()<context.effectiveSessionExpiresAt.getTime();
}

/** Owns persistence while operation/resource authorization is composed by the owning features. */
export class PostgresRecentAuthenticationRepository implements RecentAuthenticationRepository {
  /**
   * Requires explicit transaction-bound resource authorization with no permissive fallback.
   * @param executeWithDatabase - Existing guarded current-user executor.
   * @param createAuthorizer - Owned resource/return reader using that same transaction.
   */
  constructor(private readonly executeWithDatabase:DatabaseExecutor,private readonly createAuthorizer:(database:RequestDatabase)=>ReauthenticationResourceAuthorizer) {}

  /**
   * Creates a one-use intent only for a current leader's authorized resource/return.
   * @param command - Current private identity and an explicitly authorized return target.
   * @returns The stored private intent or a closed current-context outcome.
   */
  create(command:CreateReauthenticationIntentCommand) {
    return this.executeWithDatabase(async(database)=>{
      const context=await lockCurrentContext(database,command);
      if(!context) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const resource=await this.createAuthorizer(database).resolve(command);
      const now=await readClock(database);
      if(!resource?.allowedReturnPaths.includes(command.returnPath)||!sessionsRemainLive(context,now)) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const intent=(await database.execute<IntentRow>(sql`insert into public.global_reauthentication_intents(user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,created_at,expires_at) values (${command.userId},${command.sessionId},${command.accountId},${command.subject},${command.tribeId},${command.operation},${command.resourceId},${command.returnPath},${now},${new Date(now.getTime()+RECENT_AUTHENTICATION_WINDOW_MS)}) returning *`)).rows[0];
      return {status:GLOBAL_REAUTHENTICATION_OUTCOME.created,intent:mapIntent(intent)};
    });
  }

  /**
   * Issues plaintext once to the native OAuth decorator, persisting only its digest.
   * @param command - The current original session and exact stored intent scope.
   * @returns One plaintext nonce or a closed outcome; subsequent issuance cannot recover it.
   */
  issueNonce(command:IssueReauthenticationNonceCommand) {
    return this.executeWithDatabase(async(database)=>{
      const context=await lockCurrentContext(database,command);
      if(!context) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const resource=await this.createAuthorizer(database).resolve(command);
      const row=(await database.execute<IntentRow>(sql`select * from public.global_reauthentication_intents where id=${command.intentId} and user_id=${command.userId} and original_session_id=${command.sessionId} and account_id=${command.accountId} and provider_subject=${command.subject} and tribe_id=${command.tribeId} and operation=${command.operation} and resource_id=${command.resourceId} for update`)).rows[0];
      const issued=await issueGlobalReauthenticationNonce();
      const now=await readClock(database);
      if(!resource||!row||!resource.allowedReturnPaths.includes(row.return_path)||row.state!==GLOBAL_REAUTHENTICATION_INTENT_STATE.created||now.getTime()>=new Date(row.expires_at).getTime()||!sessionsRemainLive(context,now)) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.intentUnusable};
      await database.execute(sql`update public.global_reauthentication_intents set state=${GLOBAL_REAUTHENTICATION_INTENT_STATE.authorizing},nonce_hash=${Buffer.from(issued.nonceHash)},version=version+1 where id=${row.id} and version=${row.version}`);
      return {status:GLOBAL_REAUTHENTICATION_OUTCOME.authorizing,nonce:issued.nonce};
    });
  }

  /**
   * Consumes a legitimate callback once; signed auth_time determines emitted recency.
   * @param command - Verified native completion and an opaque intent reference.
   * @returns Consumed outcome and optional recency, or a closed result without consumption.
   */
  complete(command:CompleteGlobalReauthenticationCommand) {
    return this.executeWithDatabase(async(database)=>{
      const actor=(await database.execute<{actor:string|null}>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
      if(actor!==command.userId) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const initial=(await database.execute<IntentRow>(sql`select * from public.global_reauthentication_intents where id=${command.intentId} and user_id=${command.userId} and account_id=${command.accountId} and provider_subject=${command.evidence.subject}`)).rows[0];
      if(!initial) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.intentUnusable};
      const scope={userId:command.userId,accountId:command.accountId,subject:command.evidence.subject,sessionId:command.sessionId,tribeId:initial.tribe_id,operation:initial.operation,resourceId:initial.resource_id};
      const context=await lockCurrentContext(database,scope,initial.original_session_id);
      if(context?.normalizedEmail!==command.evidence.normalizedEmail) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const resource=await this.createAuthorizer(database).resolve(scope);
      if(!resource?.allowedReturnPaths.includes(initial.return_path)) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.contextUnavailable};
      const row=(await database.execute<IntentRow>(sql`select * from public.global_reauthentication_intents where id=${initial.id} for update`)).rows[0];
      if(!row) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.intentUnusable};
      const nonceVerified=await matchesGlobalReauthenticationNonce(command.evidence.nonce,row.nonce_hash);
      const now=await readClock(database);
      const sessionActive=sessionsRemainLive(context,now);
      const permitted=evaluateGlobalReauthenticationCallback({now,scope,intent:{...mapIntent(row),nonceVerified},sessionActive,currentLeaderUserId:scope.userId});
      if(!permitted.allowed) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.intentUnusable};
      await database.execute(sql`update public.global_reauthentication_intents set state=${GLOBAL_REAUTHENTICATION_INTENT_STATE.consumed},consumed_at=${now},version=version+1 where id=${row.id} and version=${row.version}`);
      const authenticatedAt=command.evidence.authenticatedAt;
      const proposed:RecentAuthenticationEvidence={...scope,id:row.id,intentId:row.id,authenticatedAt,verifiedAt:now,validUntil:new Date((authenticatedAt?.getTime()??0)+RECENT_AUTHENTICATION_WINDOW_MS),invalidatedAt:null};
      if(!evaluateRecentAuthentication({now,scope,evidence:proposed,sessionActive,currentLeaderUserId:scope.userId}).allowed) return {status:GLOBAL_REAUTHENTICATION_OUTCOME.consumed,evidence:null};
      const evidence=(await database.execute<{id:string}>(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${row.id},${scope.userId},${scope.accountId},${scope.subject},${scope.sessionId},${scope.tribeId},${scope.operation},${scope.resourceId},${authenticatedAt},${now},${proposed.validUntil}) returning id`)).rows[0];
      return {status:GLOBAL_REAUTHENTICATION_OUTCOME.consumed,evidence:{...proposed,id:evidence.id}};
    });
  }
}
