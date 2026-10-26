/** Projects current global identity from owned SQL without provider credentials. */
import "server-only";
import {sql} from "drizzle-orm";
import {GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
import type {AuthenticatedAccount} from "@/src/modules/auth/domain/entities/authenticated-account";
import type {AuthenticatedAccountProvider} from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Contains only identifiers resolved by the real global session adapter. */
export type CurrentGlobalSessionIdentity={userId:string;sessionId:string};
type AccountDatabaseExecutor=<Result>(identity:CurrentGlobalSessionIdentity,run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** `standalone` when the executor runs the projection alone, outside a transaction, so the SQL function sets and restores the request actor itself. */
export type AccountProjectionOptions={standalone?:boolean};
type IdentityProjection=Omit<NonNullable<AuthenticatedAccount["identityEvidence"]>,"verifiedAt"|"invalidatedAt">&{verifiedAt:string;invalidatedAt:string|null};
type AccountRow={user_id:string;normalized_email:string;session_id:string;expires_at:string;account_id:string|null;subject:string|null;identity_evidence:IdentityProjection|null};

/** Reads one coherent private snapshot; facts do not replace each sensitive writer's revalidation. */
export class PostgresAuthenticatedAccountProvider implements AuthenticatedAccountProvider {
  /**
   * Receives session identity and the existing guarded database composition.
   * @param getSessionIdentity - Real global session identity, without tokens/profile/roles.
   * @param executeWithDatabase - Guard that sets the actual current user for owned SQL, or a standalone single-statement executor.
   * @param options - Whether the executor runs the projection alone (`read_authenticated_account` then sets and restores the actor).
   */
  constructor(private readonly getSessionIdentity:()=>Promise<CurrentGlobalSessionIdentity|null>,private readonly executeWithDatabase:AccountDatabaseExecutor,private readonly options:AccountProjectionOptions={}) {}

  /**
   * Resolves only trusted request identifiers, without asserting SQL liveness or permission.
   * @returns A detached identifier pair, or null when the native session source has no identity.
   * @remarks Writers must revalidate current account, session and authority in their own transaction.
   */
  async getCurrentSessionIdentity():Promise<CurrentGlobalSessionIdentity|null> {
    const identity=await this.getSessionIdentity();
    return identity?{userId:identity.userId,sessionId:identity.sessionId}:null;
  }

  /**
   * Projects the actual current account and its matching identity capture.
   * @returns Null for an expired/foreign session; missing identity remains insufficient.
   */
  async getAuthenticatedAccount():Promise<AuthenticatedAccount|null> {
    const identity=await this.getCurrentSessionIdentity();
    if(!identity) return null;
    return this.executeWithDatabase(identity,async(database)=>{
      const row=(await database.execute<AccountRow>(sql`select user_id,normalized_email,session_id,expires_at,account_id,subject,identity_evidence from public.read_authenticated_account(${identity.userId},${identity.sessionId},${GOOGLE_IDENTITY_PROVIDER},${this.options.standalone===true})`)).rows[0];
      if(!row) return null;
      const evidence=row.identity_evidence;
      return {userId:row.user_id,normalizedEmail:row.normalized_email,session:{id:row.session_id,expiresAt:new Date(row.expires_at)},googleAccount:row.account_id&&row.subject?{id:row.account_id,subject:row.subject}:null,
        identityEvidence:evidence?{...evidence,verifiedAt:new Date(evidence.verifiedAt),invalidatedAt:evidence.invalidatedAt?new Date(evidence.invalidatedAt):null}:null,
      };
    });
  }
}
