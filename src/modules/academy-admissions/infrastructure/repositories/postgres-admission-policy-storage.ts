/** Maps the consumed owned policy fields without schema-validating PostgreSQL rows. @module postgres-admission-policy-storage */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionPolicy } from "../../domain/entities/admission-policy";

/** Keeps native timestamp forms at the persistence boundary before mapping to the domain. */
export type StoredAdmissionPolicy = Omit<AdmissionPolicy, "activatedAt"> & { activatedAt: Date | string | null };

/** @param row - Fields selected explicitly by the policy owner. @returns Domain dates without validating native rows as public DTOs. */
export function mapStoredAdmissionPolicy(row: StoredAdmissionPolicy): AdmissionPolicy {
  return { ...row, activatedAt: row.activatedAt ? new Date(row.activatedAt) : null };
}

/** Explicit policy columns aliased to `StoredAdmissionPolicy`, shared by every policy read. */
const STORED_ADMISSION_POLICY_COLUMNS = sql.raw(`tribe_id as id,tribe_id as "tribeId",mode,contact_type as "contactType",is_open as "isOpen",allow_common_exceptions as "allowCommonExceptions",requires_additional_verification as "requiresAdditionalVerification",requires_whatsapp_number as "requiresWhatsappNumber",phone_channel as "phoneChannel",allow_sms_alternative as "allowSmsAlternative",messaging_connection_id as "messagingConnectionId",messaging_connection_version as "messagingConnectionVersion",verification_epoch as "verificationEpoch",version,activated_at as "activatedAt"`);

/** Settings, policy and protection marker of one tribe, read together under the same shared locks as separate reads. */
export type LockedAdmissionPolicyGate = { settings: { access_model: string; admission_enabled: boolean } | null; policy: AdmissionPolicy | null; marker: Date | null };

/**
 * Reads the academy settings and the policy `FOR SHARE`, then the protection marker, in one statement.
 *
 * The scalar subqueries run in select-list order, so the locks are taken in the same order as the
 * three former reads (settings, policy, then the tribe row the caller already holds).
 * @param database - Transaction retaining the tribe lock. @param tribeId - Already authorized tenant.
 * @returns Stored facts or genuine absences, without creating settings or policy.
 */
export async function readLockedAdmissionPolicyGate(database: RequestDatabase, tribeId: string): Promise<LockedAdmissionPolicyGate> {
  const row = (await database.execute<{ settings: LockedAdmissionPolicyGate["settings"]; policy: StoredAdmissionPolicy | null; marker: Date | string | null }>(sql`select (select jsonb_build_object('access_model',settings.access_model,'admission_enabled',settings.admission_enabled) from public.tribe_academy_settings settings where settings.tribe_id=${tribeId} for share) as settings,(select to_jsonb(stored) from (select ${STORED_ADMISSION_POLICY_COLUMNS} from public.academy_admission_policies where tribe_id=${tribeId} for share) stored) as policy,(select admissions_control_activated_at from public.tribes where id=${tribeId}) as marker`)).rows[0];
  return { settings: row?.settings ?? null, policy: row?.policy ? mapStoredAdmissionPolicy(row.policy) : null, marker: row?.marker ? new Date(row.marker) : null };
}

/** @param database - Original transaction. @param tribeId - Already authorized tenant. @param mutation - Whether a new command retains an exclusive policy lock. @returns Stored policy or genuine absence. */
export async function readAdmissionPolicy(database: RequestDatabase, tribeId: string, mutation: boolean): Promise<AdmissionPolicy | null> {
  const row = (await database.execute<StoredAdmissionPolicy>(sql`select ${STORED_ADMISSION_POLICY_COLUMNS} from public.academy_admission_policies where tribe_id=${tribeId} ${mutation ? sql`for update` : sql`for share`}`)).rows[0];
  return row ? mapStoredAdmissionPolicy(row) : null;
}

/** @param database - Transaction retaining the tribe lock. @param tribeId - Exact authorized tenant. @returns The monotonic protection marker without creating settings or policy. */
export async function readAdmissionControlMarker(database: RequestDatabase, tribeId: string): Promise<Date | null> {
  const row = (await database.execute<{ activated_at: Date | string | null }>(sql`select admissions_control_activated_at as activated_at from public.tribes where id=${tribeId}`)).rows[0];
  return row?.activated_at ? new Date(row.activated_at) : null;
}

/**
 * Reads the policy, with the same lock as `readAdmissionPolicy`, and the unlocked protection marker in one statement; a missing policy still yields the marker.
 * @param database - Transaction retaining the tribe lock. @param tribeId - Already authorized tenant. @param mutation - Whether a new command retains an exclusive policy lock.
 * @returns Stored policy or genuine absence, and the marker, without creating settings or policy.
 */
export async function readAdmissionPolicyWithControlMarker(database: RequestDatabase, tribeId: string, mutation: boolean): Promise<{ policy: AdmissionPolicy | null; marker: Date | null }> {
  const row = (await database.execute<{ policy: StoredAdmissionPolicy | null; marker: Date | string | null }>(sql`select case when policy.id is null then null else to_jsonb(policy) end as policy,(select admissions_control_activated_at from public.tribes where id=${tribeId}) as marker from (values (true)) as anchor(present) left join (select ${STORED_ADMISSION_POLICY_COLUMNS} from public.academy_admission_policies where tribe_id=${tribeId} ${mutation ? sql`for update` : sql`for share`}) policy on true`)).rows[0];
  return { policy: row?.policy ? mapStoredAdmissionPolicy(row.policy) : null, marker: row?.marker ? new Date(row.marker) : null };
}
