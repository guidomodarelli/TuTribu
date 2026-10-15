/** Stores scoped admission preferences under native locks without creating deliveries. @module postgres-admission-notification-preference-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAdmissionAuthorizationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-authorization-reader";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_PREFERENCE_REJECTION, ADMISSION_NOTIFICATION_PREFERENCE_STATUS } from "../../constants/admission-notification-preference";
import type { AdmissionNotificationPreference, AdmissionNotificationPreferenceChange, AdmissionNotificationPreferenceChangePlan, AdmissionNotificationPreferenceContext, AdmissionNotificationPreferenceResolution } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceRepository, AdmissionNotificationPreferenceScope } from "../../domain/repositories/admission-notification-preference-repository";
import { planAdmissionNotificationPreferenceChange, resolveAdmissionNotificationPreference } from "../../domain/policies/admission-notification-preference";

/** Runs one native authenticated transaction and propagates failures to its rollback boundary. */
type PreferenceDatabaseExecutor = <Result>(scope: AdmissionNotificationPreferenceScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Keeps database timestamp text at its original precision. */
type PreferenceStorageRow = { tribe_id: string; recipient_user_id: string; mode: AdmissionNotificationPreference["mode"]; version: number; effective_from: string };

/** @param row - Actual scoped PostgreSQL projection. @returns Only private preference fields, never adapter metadata. */
function mapPreference(row: PreferenceStorageRow): AdmissionNotificationPreference {
  return { tribeId: row.tribe_id, recipientUserId: row.recipient_user_id, mode: row.mode, version: row.version, effectiveFrom: row.effective_from };
}

/** Reuses the admission owner for native identity and active reviewer locks. */
export class PostgresAdmissionNotificationPreferenceRepository implements AdmissionNotificationPreferenceRepository {
  /** @param execute - Trusted composition binding the actual account to its guarded transaction. */
  constructor(private readonly execute: PreferenceDatabaseExecutor) {}

  /**
   * Holds tribe, account, session and membership before preference resources.
   * @param database - Original transaction, never a preflight connection.
   * @param scope - Exact server-derived actor/session/tribe.
   * @returns Current reviewer facts and the precise SQL clock after waits.
   * @throws When native identity, current reviewer authority or session lifetime is unavailable.
   */
  private async authorize(database: RequestDatabase, scope: AdmissionNotificationPreferenceScope): Promise<{ context: AdmissionNotificationPreferenceContext; now: string }> {
    const locked = (await database.execute<{ locked: boolean }>(sql`select public.lock_academy_admission_administrative_reader(${scope.tribeId},${scope.sessionId}) as locked where public.current_app_user_id()=${scope.userId}`)).rows[0]?.locked;
    if (!locked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readInbox).getCurrentActor(scope.tribeId, scope.userId);
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const context: AdmissionNotificationPreferenceContext = { tribeId: scope.tribeId, recipientUserId: scope.userId, currentRole: actor.role, membershipStatus: actor.status };
    if (resolveAdmissionNotificationPreference(context, null).status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const instant = (await database.execute<{ now: string }>(sql`select clock_timestamp()::text as now from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "expiresAt">clock_timestamp()`)).rows[0];
    if (!instant) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return { context, now: instant.now };
  }

  /** @param database - Authorized native transaction. @param scope - Own recipient/tribe. @param lock - Locks existing rows for a mutation; creation races use unique insert CAS. @returns The explicit own choice or absence, without initialization. */
  private async read(database: RequestDatabase, scope: AdmissionNotificationPreferenceScope, lock: boolean): Promise<AdmissionNotificationPreference | null> {
    const row = (await database.execute<PreferenceStorageRow>(sql`select tribe_id,recipient_user_id,mode,version,effective_from::text from public.admission_notification_preferences where tribe_id=${scope.tribeId} and recipient_user_id=${scope.userId} ${lock ? sql`for update` : sql``}`)).rows[0];
    return row ? mapPreference(row) : null;
  }

  /** @param scope - Current native actor, session and exact tribe. @returns A role default or stored own choice without writes. @throws When current authentication or reviewer authority is unavailable. */
  async getOwn(scope: AdmissionNotificationPreferenceScope): Promise<AdmissionNotificationPreferenceResolution> {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const stored = await this.read(database, scope, false);
      const { context } = await this.authorize(database, scope);
      return resolveAdmissionNotificationPreference(context, stored);
    });
  }

  /** @param scope - Actual current native recipient/session/tribe. @param change - Boundary-validated explicit mode and observed version. @returns The committed exact record, unchanged choice or stale-version rejection. @throws When storage or the final session/role guard fails; the executor must roll back staged writes. */
  async changeOwn(scope: AdmissionNotificationPreferenceScope, change: AdmissionNotificationPreferenceChange): Promise<AdmissionNotificationPreferenceChangePlan> {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const stored = await this.read(database, scope, true);
      const { context, now } = await this.authorize(database, scope);
      const plan = planAdmissionNotificationPreferenceChange(context, stored, change, now);
      if (plan.status !== ADMISSION_NOTIFICATION_PREFERENCE_STATUS.changed) return plan;
      const result = stored
        ? await database.execute<PreferenceStorageRow>(sql`update public.admission_notification_preferences set mode=${plan.preference.mode},version=${plan.preference.version} where tribe_id=${scope.tribeId} and recipient_user_id=${scope.userId} and version=${change.expectedVersion} returning tribe_id,recipient_user_id,mode,version,effective_from::text`)
        : await database.execute<PreferenceStorageRow>(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${scope.tribeId},${scope.userId},${plan.preference.mode},${plan.preference.version}) on conflict (tribe_id,recipient_user_id) do nothing returning tribe_id,recipient_user_id,mode,version,effective_from::text`);
      await this.authorize(database, scope);
      const saved = result.rows[0];
      return saved
        ? { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.changed, preference: mapPreference(saved) }
        : { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected, reason: ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.versionConflict };
    });
  }
}
