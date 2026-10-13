/** Projects current global identity and recency from owned SQL without provider credentials. */
import "server-only";
import {sql} from "drizzle-orm";
import {GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
import type {AuthenticatedAccount} from "@/src/modules/auth/domain/entities/authenticated-account";
import type {RecentAuthenticationEvidence} from "@/src/modules/auth/domain/entities/recent-authentication-evidence";
import type {AuthenticatedAccountProvider} from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Contains only identifiers resolved by the real global session adapter. */
export type CurrentGlobalSessionIdentity={userId:string;sessionId:string};
type AccountDatabaseExecutor=<Result>(identity:CurrentGlobalSessionIdentity,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
type IdentityProjection=Omit<NonNullable<AuthenticatedAccount["identityEvidence"]>,"verifiedAt"|"invalidatedAt">&{verifiedAt:string;invalidatedAt:string|null};
type RecentProjection=Omit<RecentAuthenticationEvidence,"authenticatedAt"|"verifiedAt"|"validUntil"|"invalidatedAt">&{authenticatedAt:string;verifiedAt:string;validUntil:string;invalidatedAt:string|null};
type AccountRow={user_id:string;normalized_email:string;session_id:string;expires_at:string;account_id:string|null;subject:string|null;identity_evidence:IdentityProjection|null;recent_authentication:RecentProjection[]};

/** Reads one coherent private snapshot; facts do not replace each sensitive writer's revalidation. */
export class PostgresAuthenticatedAccountProvider implements AuthenticatedAccountProvider {
  /**
   * Receives session identity and the existing guarded database composition.
   * @param getSessionIdentity - Real global session identity, without tokens/profile/roles.
   * @param executeWithDatabase - Guard that sets the actual current user for owned SQL.
   */
  constructor(private readonly getSessionIdentity:()=>Promise<CurrentGlobalSessionIdentity|null>,private readonly executeWithDatabase:AccountDatabaseExecutor) {}

  /**
   * Projects the actual current account, matching capture and operation-scoped recent evidence.
   * @returns Null for an expired/foreign session; missing identity remains insufficient.
   */
  async getAuthenticatedAccount():Promise<AuthenticatedAccount|null> {
    const identity=await this.getSessionIdentity();
    if(!identity) return null;
    return this.executeWithDatabase(identity,async(database)=>{
      const row=(await database.execute<AccountRow>(sql`
        select account_user.id as user_id,lower(btrim(account_user.email)) as normalized_email,
          current_session.id as session_id,current_session."expiresAt" as expires_at,
          google_account.id as account_id,google_account."accountId" as subject,
          case when capture.id is null then null else jsonb_build_object('id',capture.id,'userId',capture.user_id,'accountId',capture.account_id,'subject',capture.provider_subject,'normalizedEmail',capture.normalized_email,'classification',capture.classification,'version',capture.version,'verifiedAt',capture.verified_at,'invalidatedAt',capture.invalidated_at) end as identity_evidence,
          coalesce((select jsonb_agg(jsonb_build_object('id',recent.id,'intentId',recent.intent_id,'userId',recent.user_id,'sessionId',recent.session_id,'accountId',recent.account_id,'subject',recent.provider_subject,'tribeId',recent.tribe_id,'operation',recent.operation,'resourceId',recent.resource_id,'authenticatedAt',recent.authenticated_at,'verifiedAt',recent.verified_at,'validUntil',recent.valid_until,'invalidatedAt',recent.invalidated_at)) from public.recent_authentication_evidence recent where recent.user_id=account_user.id and recent.session_id=current_session.id and recent.account_id=google_account.id and recent.provider_subject=google_account."accountId" and recent.invalidated_at is null and recent.authenticated_at<=clock_timestamp() and recent.valid_until>clock_timestamp()),'[]'::jsonb) as recent_authentication
        from public."user" account_user
        inner join public.session current_session on current_session."userId"=account_user.id and current_session.id=${identity.sessionId} and current_session."expiresAt">clock_timestamp()
        left join public.global_session_identity_bindings binding on binding.session_id=current_session.id and binding.user_id=account_user.id
        left join lateral (
          select linked.* from public.account linked where linked."userId"=account_user.id and linked."providerId"=${GOOGLE_IDENTITY_PROVIDER} and (
            (binding.session_id is not null and binding.invalidated_at is null and binding.normalized_email=lower(btrim(account_user.email)) and linked.id=binding.account_id and linked."accountId"=binding.provider_subject)
            or (binding.session_id is null and (select count(*) from public.account candidate where candidate."userId"=account_user.id and candidate."providerId"=${GOOGLE_IDENTITY_PROVIDER})=1)
          )
        ) google_account on true
        left join public.global_identity_evidence capture on capture.user_id=account_user.id and capture.account_id=google_account.id and capture.provider_id=${GOOGLE_IDENTITY_PROVIDER} and capture.provider_subject=google_account."accountId" and capture.normalized_email=lower(btrim(account_user.email)) and capture.invalidated_at is null
        where account_user.id=${identity.userId} and public.current_app_user_id()=${identity.userId}
      `)).rows[0];
      if(!row) return null;
      const evidence=row.identity_evidence;
      return {userId:row.user_id,normalizedEmail:row.normalized_email,session:{id:row.session_id,expiresAt:new Date(row.expires_at)},googleAccount:row.account_id&&row.subject?{id:row.account_id,subject:row.subject}:null,
        identityEvidence:evidence?{...evidence,verifiedAt:new Date(evidence.verifiedAt),invalidatedAt:evidence.invalidatedAt?new Date(evidence.invalidatedAt):null}:null,
        recentAuthentication:row.recent_authentication.map((recent)=>({...recent,authenticatedAt:new Date(recent.authenticatedAt),verifiedAt:new Date(recent.verifiedAt),validUntil:new Date(recent.validUntil),invalidatedAt:recent.invalidatedAt?new Date(recent.invalidatedAt):null})),
      };
    });
  }
}
