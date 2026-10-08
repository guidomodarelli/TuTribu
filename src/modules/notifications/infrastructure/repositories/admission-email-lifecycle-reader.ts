/** Reads the independent admission email dependency without initializing settings or consulting a provider. @module admission-email-lifecycle-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingConnectionLifecycleContext } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";

/**
 * Reads current owned email settings; absence is the specified OFF default, while unavailable storage throws.
 * @param context - Exact current native local lifecycle authority.
 * @param database - Existing transaction retaining identity/tribe/connection locks.
 * @returns Whether current external admission email remains enabled, with no persistence or retroactive dispatch.
 */
export async function readAdmissionEmailLifecycleDependency(context:MessagingConnectionLifecycleContext,database:RequestDatabase):Promise<boolean>{
  const row=(await database.execute<{enabled:boolean}>(sql`select enabled from public.admission_email_settings where tribe_id=${context.tribeId} for share`)).rows[0];
  return row?.enabled??false;
}
