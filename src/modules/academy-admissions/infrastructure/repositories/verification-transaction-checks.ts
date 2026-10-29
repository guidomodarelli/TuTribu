/** Transaction checks shared by the contact verification adapters: the actual SQL actor with its owner authority, and the database clock. @module verification-transaction-checks */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { VerificationChallengeScope } from "../../domain/entities/contact-verification-challenge";

/** Current owner authorization of one verification scope inside the caller's transaction. */
type VerificationScopeAuthorizer = (database: RequestDatabase, scope: VerificationChallengeScope) => Promise<boolean>;

/**
 * Checks the actual SQL actor and the owner scope; an input userId is never authority.
 * @param database - Current transaction.
 * @param authorize - Owner authorization of the scope.
 * @param scope - Own scope to revalidate.
 * @returns Whether the current SQL actor is the scope's user and still holds the owner authorization.
 */
export async function isCurrentVerificationActor(database: RequestDatabase, authorize: VerificationScopeAuthorizer, scope: VerificationChallengeScope): Promise<boolean> {
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor;
  return actor === scope.userId && await authorize(database, scope);
}

/**
 * Samples the database clock after lock waits and asynchronous local cryptography.
 * @param database - Current transaction.
 * @returns The current database timestamp, never a browser or process clock.
 */
export async function readVerificationDatabaseNow(database: RequestDatabase): Promise<Date> {
  return new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
}
