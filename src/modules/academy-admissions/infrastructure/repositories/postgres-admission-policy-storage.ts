/** Maps the consumed owned policy fields without schema-validating PostgreSQL rows. @module postgres-admission-policy-storage */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";

/** @param database - Original transaction. @param tribeId - Already authorized tenant. @param mutation - Whether a new command retains an exclusive policy lock. @returns Stored policy or genuine absence. */
export async function readAdmissionPolicy(database: RequestDatabase, tribeId: string, mutation: boolean): Promise<AdmissionPolicy | null> {
  const row = (await database.execute<AdmissionPolicy>(sql`select tribe_id as id,tribe_id as "tribeId",mode,contact_type as "contactType",is_open as "isOpen",allow_common_exceptions as "allowCommonExceptions",requires_additional_verification as "requiresAdditionalVerification",phone_channel as "phoneChannel",allow_sms_alternative as "allowSmsAlternative",messaging_connection_id as "messagingConnectionId",messaging_connection_version as "messagingConnectionVersion",verification_epoch as "verificationEpoch",version,activated_at as "activatedAt" from public.academy_admission_policies where tribe_id=${tribeId} ${mutation ? sql`for update` : sql`for share`}`)).rows[0];
  return row ? { ...row, activatedAt: row.activatedAt ? new Date(row.activatedAt) : null } : null;
}

/** @param database - Transaction retaining the tribe lock. @param tribeId - Exact authorized tenant. @returns The monotonic protection marker without creating settings or policy. */
export async function readAdmissionControlMarker(database: RequestDatabase, tribeId: string): Promise<Date | null> {
  const row = (await database.execute<{ activated_at: Date | string | null }>(sql`select admissions_control_activated_at as activated_at from public.tribes where id=${tribeId}`)).rows[0];
  return row?.activated_at ? new Date(row.activated_at) : null;
}
