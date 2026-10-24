/** Commits native identity capture on the guarded transaction of the completed sign-in. */
import "server-only";
import type {CompletedGoogleLogin} from "@/src/modules/auth/infrastructure/better-auth/auth-evidence-context";
import {PostgresGlobalIdentityEvidenceRepository} from "@/src/modules/auth/infrastructure/repositories/postgres-global-identity-evidence-repository";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Applies only a native, signed, account/session-bound completion; no browser flag grants authority.
 * @param database - Existing current-user transaction after the native handler completed.
 * @param completion - Private SDK completion with its signed identity facts.
 * @returns Capture status; a mismatch never changes the global login.
 */
export async function persistCompletedGlobalAuthentication(database:RequestDatabase,completion:CompletedGoogleLogin):Promise<{status:"stored"|"identity_mismatch"}> {
  const execute=<Result>(run:(transaction:RequestDatabase)=>Promise<Result>)=>run(database);
  const capture=await new PostgresGlobalIdentityEvidenceRepository(execute).capture(completion);
  return {status:capture.status};
}
