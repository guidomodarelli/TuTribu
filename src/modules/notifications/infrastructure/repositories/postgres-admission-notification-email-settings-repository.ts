/** Commits independent email settings with exact native cuts, tested capability and the original operation ledger. @module postgres-admission-notification-email-settings-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { admissionDatabaseNow } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-leader-authorizer";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionNotificationEmailSettings } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationEmailSettingsChangePlan } from "../../domain/entities/admission-notification-email-settings";
import type { AdmissionNotificationEmailSettingsCommand, AdmissionNotificationEmailSettingsCurrent, AdmissionNotificationEmailSettingsRepository } from "../../domain/repositories/admission-notification-email-settings-repository";
import { planAdmissionNotificationEmailSettingsChange, resolveAdmissionNotificationEmailSettings } from "../../domain/policies/admission-notification-email-settings";
import { admissionEmailSettingsChangeResultSchema } from "../../application/results/admission-email-settings-result-schemas";
import { ADMISSION_EMAIL_SETTINGS_AUDIT, ADMISSION_EMAIL_SETTINGS_OPERATION, ADMISSION_EMAIL_SETTINGS_REJECTION, ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";

/** Reuses the caller's guarded transaction without a nested checkout or outbound work. */
type SettingsDatabaseExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Keeps native epoch microseconds exact rather than round-tripping through Date. */
type SettingsRow = { tribe_id: string; enabled: boolean; version: number; enabled_at_microseconds: string | null; time_zone: string };

/** @param row - Actual owned database projection. @returns Only private settings consumed by the notification owner. */
function mapSettings(row: SettingsRow): AdmissionNotificationEmailSettings {
  return { tribeId: row.tribe_id, enabled: row.enabled, version: row.version, enabledAtMicroseconds: !row.enabled || row.enabled_at_microseconds === null ? null : Number(row.enabled_at_microseconds), timeZone: row.time_zone };
}

/** Separates read-only defaults, original confirmed outcomes and current tested email authority. */
export class PostgresAdmissionNotificationEmailSettingsRepository implements AdmissionNotificationEmailSettingsRepository {
  /**
   * @param execute - Native current-user transaction executor.
   * @param readSecurityConfig - Current local hosting configuration; never a provider call.
   * @param readPlatformSecurity - Runs, inside the authorized read transaction, the same hosting security checks the ledger runs before
   * signing a change (import and enrolled proofs), without exposing keys; null when a change can be protected.
   */
  constructor(private readonly execute: SettingsDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly readPlatformSecurity: (database: RequestDatabase) => Promise<PlatformSecurityRequirement | null>) {}

  /** @param database - Original transaction. @param context - Server-resolved current native actor. @param mutate - Requires this settings action's own operation scope only when changing configuration. @returns After canonical leadership, session and academy checks. */
  private async authorize(database: RequestDatabase, context: AuthorizedAdmissionContext, mutate: boolean): Promise<void> {
    await authorizeAdmissionPolicy(database, context, mutate ? REAUTHENTICATION_OPERATION.updateAdmissionEmailSettings : undefined);
    const academy = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${context.tribeId} for share`)).rows[0];
    if (academy?.access_model !== TRIBE_ACCESS_MODEL.academy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  }

  /** @param database - Authorized native transaction. @param tribeId - Exact tenant. @param lock - Takes the resource write lock for CAS. @returns Current settings or actual absence, without initialization. */
  private async read(database: RequestDatabase, tribeId: string, lock: boolean): Promise<AdmissionNotificationEmailSettings | null> {
    const row = (await database.execute<SettingsRow>(sql`select tribe_id,enabled,version,(extract(epoch from enabled_at)*1000000)::bigint::text as enabled_at_microseconds,time_zone from public.admission_email_settings where tribe_id=${tribeId} ${lock ? sql`for update` : sql`for share`}`)).rows[0];
    return row ? mapSettings(row) : null;
  }

  /** @param database - Original transaction retaining the canonical tribe fence. @param context - This exact settings mutation's authority. @returns Current selected version's tested email readiness, independent of verification quota or OTP policy. */
  private async prepared(database: RequestDatabase, context: AuthorizedAdmissionContext): Promise<boolean> {
    const selected = (await database.execute<{ id: string; selected_version: number }>(sql`select id,selected_version from public.tenant_messaging_connections where tribe_id=${context.tribeId} and is_selected and retired_at is null order by id for share`)).rows[0];
    const readiness = new PostgresAdmissionVerificationReadinessReader(database, async (transaction, tribeId) => {
      if (tribeId !== context.tribeId) return false;
      await this.authorize(transaction, context, true);
      return true;
    }, this.readSecurityConfig);
    const result = await readiness.read({ tribeId: context.tribeId, connectionId: selected?.id ?? null, connectionVersion: selected?.selected_version ?? null, channel: VERIFICATION_EMAIL_CHANNEL, requiresSmsAlternative: false });
    const current = await this.readSecurityConfig(), security = result.securityScope;
    return Boolean(result.channelPrepared && security && !current.recoveryLocked && security.environment === current.environment && security.securityEpoch === current.securityEpoch && current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(security.credentialKeyId));
  }

  /** @param context - Actual current leader/session and own tribe. @returns Read-only settings and the platform requirement that blocks changing them, without credential, provider, ledger or initialization work. */
  async get(context: AuthorizedAdmissionContext): Promise<AdmissionNotificationEmailSettingsCurrent> {
    return this.execute(context, async (database) => {
      await this.authorize(database, context, false);
      const stored = await this.read(database, context.tribeId, false);
      // Every change signs its original through the admission ledger; the leader learns before writing whether the platform can protect it.
      const platformRequirement = await this.readPlatformSecurity(database);
      await this.authorize(database, context, false);
      const settings = resolveAdmissionNotificationEmailSettings(context.tribeId, stored);
      if (!settings) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return { settings, platformRequirement };
    });
  }

  /** @param context - Current native settings authority and exact sensitive purpose. @param input - Validated confirmed command with original operation/version/zone. @returns The original confirmed outcome or actual registered progress; no send or OTP policy mutation occurs. @throws For current denial, storage/configuration failure or unresolved original completion. */
  async change(context: AuthorizedAdmissionContext, input: AdmissionNotificationEmailSettingsCommand): Promise<AdmissionOperationResult<AdmissionNotificationEmailSettingsChangePlan>> {
    // Fail closed even if a caller bypasses the static contract (casts, untyped composition).
    if (!(input.confirmed as boolean)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const command = { actorUserId: context.userId, tribeId: context.tribeId, operationType: ADMISSION_EMAIL_SETTINGS_OPERATION, idempotencyKey: input.operationId, intent: { expectedVersion: input.expectedVersion, enabled: input.enabled, timeZone: input.timeZone } };
    const ledger = new PostgresAdmissionOperationRepository((run) => this.execute(context, run), async (database) => { await this.authorize(database, context, true); return true; }, this.readSecurityConfig);
    try {
      return await ledger.run(command, admissionEmailSettingsChangeResultSchema, async (database, ledgerId) => {
        const stored = await this.read(database, context.tribeId, true);
        const timeZoneExists = (await database.execute(sql`select name from pg_timezone_names where name=${input.timeZone}`)).rows[0];
        if (!timeZoneExists) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
        const available = input.enabled && (!stored?.enabled || stored.timeZone !== input.timeZone) ? await this.prepared(database, context) : false;
        const now = Number((await database.execute<{ now: string }>(sql`select (extract(epoch from clock_timestamp())*1000000)::bigint::text as now`)).rows[0].now);
        const plan = planAdmissionNotificationEmailSettingsChange({ tribeId: context.tribeId, stored, change: input, preparedEmail: { tribeId: context.tribeId, available }, nowMicroseconds: now });
        if (plan.status !== ADMISSION_EMAIL_SETTINGS_STATUS.changed) return plan;
        const mutation = stored
          ? sql`update public.admission_email_settings set enabled=${plan.settings.enabled},time_zone=${plan.settings.timeZone},version=${plan.settings.version},changed_by_user_id=${context.userId} where tribe_id=${context.tribeId} and version=${input.expectedVersion}`
          : sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at,time_zone,version,changed_by_user_id) values (${context.tribeId},${plan.settings.enabled},${plan.settings.enabled ? sql`clock_timestamp()` : sql`null`},${plan.settings.timeZone},${plan.settings.version},${context.userId}) on conflict(tribe_id) do nothing`;
        const written = (await database.execute<SettingsRow>(sql`${mutation} returning tribe_id,enabled,version,(extract(epoch from enabled_at)*1000000)::bigint::text as enabled_at_microseconds,time_zone`)).rows[0];
        if (!written) return { status: ADMISSION_EMAIL_SETTINGS_STATUS.rejected, reason: ADMISSION_EMAIL_SETTINGS_REJECTION.versionConflict };
        const saved = mapSettings(written);
        await new PostgresAdmissionAuditRepository(database).append(createAdmissionResourceAuditEvent({ tribeId: context.tribeId, actorUserId: context.userId, resourceType: ADMISSION_EMAIL_SETTINGS_AUDIT.resource, resourceId: context.tribeId, operationId: ledgerId, eventType: ADMISSION_EMAIL_SETTINGS_AUDIT.event, resourceVersion: saved.version, rule: null, cause: null, metadata: { previousVersion: stored?.version ?? null, enabled: saved.enabled, timeZone: saved.timeZone }, createdAt: await admissionDatabaseNow(database) }));
        if (saved.enabled && !await this.prepared(database, context)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
        await this.authorize(database, context, true);
        return { status: ADMISSION_EMAIL_SETTINGS_STATUS.changed, settings: saved };
      });
    } catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved) {
        try {
          const original = await ledger.read(command, admissionEmailSettingsChangeResultSchema);
          if (original?.state === OPERATION_STATE.completed) return original;
        } catch (recoveryError) {
          if (recoveryError instanceof AdmissionOperationError) throw recoveryError;
          throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: input.operationId, cause: new AggregateError([error, recoveryError], "Admission email settings original commit reconciliation failed", { cause: error }) });
        }
      }
      throw error;
    }
  }
}
