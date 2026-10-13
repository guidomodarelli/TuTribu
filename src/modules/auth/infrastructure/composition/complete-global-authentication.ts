/** Commits native identity capture and optional exact-intent recency on the same guarded transaction. */
import "server-only";
import type {CompletedGoogleLogin} from "@/src/modules/auth/infrastructure/better-auth/auth-evidence-context";
import {PostgresGlobalIdentityEvidenceRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-global-identity-evidence-repository";
import {PostgresRecentAuthenticationRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-recent-authentication-repository";
import {PostgresReauthenticationResourceAuthorizer} from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Applies only a native, signed, account/session-bound completion; no browser flag grants authority.
 * @param database - Existing current-user transaction after the native handler completed.
 * @param completion - Private SDK completion with optional opaque owned-intent reference.
 * @returns Capture status; failed nonce/recency never changes global login or invents freshness.
 */
export async function persistCompletedGlobalAuthentication(database:RequestDatabase,completion:CompletedGoogleLogin):Promise<{status:"stored"|"identity_mismatch"}> {
  const execute=<Result>(run:(transaction:RequestDatabase)=>Promise<Result>)=>run(database);
  const capture=await new PostgresGlobalIdentityEvidenceRepository(execute).capture(completion);
  if(capture.status!=="stored") return {status:capture.status};
  if(completion.reauthenticationIntentId) {
    const recent=new PostgresRecentAuthenticationRepository(execute,(transaction)=>new PostgresReauthenticationResourceAuthorizer(transaction));
    await recent.complete({...completion,intentId:completion.reauthenticationIntentId});
  }
  return {status:capture.status};
}
