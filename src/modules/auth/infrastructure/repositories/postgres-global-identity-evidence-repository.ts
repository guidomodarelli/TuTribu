/** Persists verified identity through current global auth records and the guarded SQL boundary. */
import "server-only";
import {sql} from "drizzle-orm";
import {GOOGLE_IDENTITY_PROVIDER} from "@/src/modules/auth/constants/google-identity-evidence";
import {GLOBAL_IDENTITY_CAPTURE_INVALIDATION_REASON,GLOBAL_IDENTITY_CAPTURE_STATUS} from "@/src/modules/auth/constants/global-identity-evidence-persistence";
import type {GlobalIdentityEvidence} from "@/src/modules/auth/domain/entities/global-identity-evidence";
import type {CaptureGlobalIdentityEvidenceCommand,CaptureGlobalIdentityEvidenceResult,GlobalIdentityEvidenceRepository,GlobalIdentityEvidenceScope} from "@/src/modules/auth/domain/repositories/global-identity-evidence-repository";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Keeps this adapter on the caller's existing protected database composition. */
type DatabaseExecutor=<Result>(run:(database:RequestDatabase)=>Promise<Result>)=>Promise<Result>;
/** Consumes only the owned capture columns; storage rows are not schema-revalidated. */
type EvidenceRow={
  id:string;user_id:string;account_id:string;provider_id:"google";provider_subject:string;
  normalized_email:string;email_verified_claim:boolean;hosted_domain:string|null;
  classification:GlobalIdentityEvidence["classification"];issuer:string;audience:string;
  token_issued_at:string;token_expires_at:string;verified_at:string;version:number;
  invalidated_at:string|null;invalidation_reason:string|null;
};

/**
 * Projects owned storage fields into the private domain capture without tokens or nonce.
 * @param row - Capture produced by the owned SQL table.
 * @returns The minimal internal identity history record.
 */
function mapEvidence(row:EvidenceRow):GlobalIdentityEvidence {
  return {
    id:row.id,userId:row.user_id,accountId:row.account_id,providerId:row.provider_id,subject:row.provider_subject,
    normalizedEmail:row.normalized_email,emailVerifiedClaim:row.email_verified_claim,hostedDomain:row.hosted_domain,
    classification:row.classification,issuer:row.issuer,audience:row.audience,
    tokenIssuedAt:new Date(row.token_issued_at),tokenExpiresAt:new Date(row.token_expires_at),
    verifiedAt:new Date(row.verified_at),version:row.version,
    invalidatedAt:row.invalidated_at?new Date(row.invalidated_at):null,invalidationReason:row.invalidation_reason,
  };
}

/** Verifies durable identity binding after locks; the callback remains responsible for cryptography. */
export class PostgresGlobalIdentityEvidenceRepository implements GlobalIdentityEvidenceRepository {
  /**
   * Receives the protected executor already selected by the global auth composition.
   * @param executeWithDatabase - One guarded transaction per repository operation.
   */
  constructor(private readonly executeWithDatabase:DatabaseExecutor) {}

  /**
   * Stores a verified callback capture only after current account/session/email agree.
   * @param command - Private native-callback identifiers and already verified claims.
   * @returns New minimal history or an insufficient identity outcome without writes.
   */
  capture(command:CaptureGlobalIdentityEvidenceCommand):Promise<CaptureGlobalIdentityEvidenceResult> {
    return this.executeWithDatabase(async(database)=>{
      const actor=(await database.execute<{actor_id:string|null}>(sql`select public.current_app_user_id() as actor_id`)).rows[0]?.actor_id;
      if(actor!==command.userId) return {status:GLOBAL_IDENTITY_CAPTURE_STATUS.identityMismatch};
      const user=(await database.execute<{email:string}>(sql`select email from public."user" where id=${command.userId} for share`)).rows[0];
      const account=(await database.execute<{subject:string}>(sql`select "accountId" as subject from public.account where id=${command.accountId} and "userId"=${command.userId} and "providerId"=${GOOGLE_IDENTITY_PROVIDER} for update`)).rows[0];
      const session=(await database.execute<{id:string}>(sql`select id from public.session where id=${command.sessionId} and "userId"=${command.userId} for share`)).rows[0];
      if(!user||!account||!session||user.email.trim().toLowerCase()!==command.evidence.normalizedEmail||account.subject!==command.evidence.subject) return {status:GLOBAL_IDENTITY_CAPTURE_STATUS.identityMismatch};
      // A new statement sees the authoritative clock after any account/session wait.
      const live=(await database.execute<{id:string}>(sql`select id from public.session where id=${command.sessionId} and "userId"=${command.userId} and "expiresAt">clock_timestamp()`)).rows[0];
      if(!live) return {status:GLOBAL_IDENTITY_CAPTURE_STATUS.identityMismatch};
      await database.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason=${GLOBAL_IDENTITY_CAPTURE_INVALIDATION_REASON.superseded} where account_id=${command.accountId} and provider_id=${GOOGLE_IDENTITY_PROVIDER} and invalidated_at is null`);
      const captured=(await database.execute<EvidenceRow>(sql`
        insert into public.global_identity_evidence(user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at)
        values (${command.userId},${command.accountId},${GOOGLE_IDENTITY_PROVIDER},${command.evidence.subject},${command.evidence.normalizedEmail},${command.evidence.emailVerifiedClaim},${command.evidence.hostedDomain},${command.evidence.classification},${command.evidence.issuer},${command.evidence.audience},${command.evidence.tokenIssuedAt},${command.evidence.tokenExpiresAt},clock_timestamp())
        returning *
      `)).rows[0];
      return {status:GLOBAL_IDENTITY_CAPTURE_STATUS.stored,evidence:mapEvidence(captured)};
    });
  }

  /**
   * Reads current evidence without OAuth, refresh, backfill or a token lifetime rule.
   * @param scope - Current private account/session identity supplied by the auth owner.
   * @returns Matching history or null when account, email, subject or session no longer agree.
   */
  getCurrent(scope:GlobalIdentityEvidenceScope):Promise<GlobalIdentityEvidence|null> {
    return this.executeWithDatabase(async(database)=>{
      const current=(await database.execute<EvidenceRow>(sql`
        select evidence.* from public.global_identity_evidence evidence
        inner join public.account account on account.id=evidence.account_id and account."userId"=evidence.user_id and account."providerId"=evidence.provider_id and account."accountId"=evidence.provider_subject
        inner join public."user" account_user on account_user.id=evidence.user_id and lower(btrim(account_user.email))=evidence.normalized_email
        inner join public.session session on session."userId"=evidence.user_id and session.id=${scope.sessionId} and session."expiresAt">clock_timestamp()
        where evidence.user_id=${scope.userId} and evidence.account_id=${scope.accountId} and evidence.provider_id=${GOOGLE_IDENTITY_PROVIDER}
          and evidence.invalidated_at is null and public.current_app_user_id()=${scope.userId}
      `)).rows[0];
      return current?mapEvidence(current):null;
    });
  }
}
