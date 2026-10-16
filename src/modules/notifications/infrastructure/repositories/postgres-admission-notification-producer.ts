/** Rotates private tenant locators and selects only whole certified windows; it never sends email. @module postgres-admission-notification-producer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_PRODUCER_LIMITS } from "../../constants/admission-notification-producer";
import { ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_GROUP_STATE } from "../../constants/admission-notification-group-storage";
import type { AdmissionNotificationProducer } from "../../domain/repositories/admission-notification-producer";
import type { AdmissionNotificationGroupPreparationCommand } from "../../domain/repositories/admission-notification-group-preparation";
import type { AdmissionNotificationCollectionExecutor } from "./postgres-admission-notification-collection-progress";

/** Keeps fairness and internal reminders independent of recipient credentials or an available provider. */
export class PostgresAdmissionNotificationProducer implements AdmissionNotificationProducer {
  /** @param execute - Existing commit-confirming maintenance transaction. @param authorize - Current private job authority, rechecked after waits. @param readRecoveryLock - Key-independent live recovery gate. */
  constructor(private readonly execute: AdmissionNotificationCollectionExecutor, private readonly authorize: () => Promise<boolean>, private readonly readRecoveryLock: () => Promise<boolean>) {}

  /** @returns Only while current private purpose and recovery state allow new producer effects. */
  private async guard(): Promise<void> {
    if (!await this.authorize()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    if (await this.readRecoveryLock()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete);
  }

  /** @param run - One short DB-only original transaction. @returns A commit-confirmed result, or a typed unresolved result without automatic retry. */
  private async confirmed<Result>(run: (database: RequestDatabase) => Promise<Result>): Promise<Result> {
    try { return await this.execute(async (database) => { await this.guard(); const result = await run(database); await this.guard(); return result; }); }
    catch (error) { if (error instanceof AdmissionOperationError) throw error; throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error }); }
  }

  /** @param excludedTribeIds - Native tenants already examined in this bounded invocation. @returns A durably rotated locator even when that tenant's provider or keys are unavailable. */
  selectNextTribe(excludedTribeIds: readonly string[]): Promise<string | null> {
    if (excludedTribeIds.length > ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return this.confirmed(async (database) => {
      const selected = (await database.execute<{ tribe_id: string }>(sql`with candidate as (
        select tribe.id from public.tribes tribe
        left join public.admission_notification_producer_progress progress on progress.tribe_id=tribe.id
        where not (tribe.id=any(${sql.param(excludedTribeIds)}::uuid[])) and (
          exists(select 1 from public.admission_notification_groups notification_group where notification_group.tribe_id=tribe.id and notification_group.state=${ADMISSION_NOTIFICATION_GROUP_STATE.open})
          or exists(select 1 from public.academy_admission_notification_obligations obligation join public.admission_email_settings settings on settings.tribe_id=obligation.tribe_id and settings.enabled
            where obligation.tribe_id=tribe.id and obligation.created_at>clock_timestamp()-${ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds}::bigint*interval '1 microsecond'))
        order by progress.last_selected_at nulls first,tribe.id for update of tribe skip locked limit 1
      ) insert into public.admission_notification_producer_progress(tribe_id) select id from candidate
      on conflict (tribe_id) do update set version=admission_notification_producer_progress.version+1
      returning tribe_id`)).rows[0];
      return selected?.tribe_id ?? null;
    });
  }

  /** @param tribeId - Existing native tenant selected by the protected backend. @returns Original due groups only after the persisted whole-sweep cutoff covers their entire window. */
  readReadyGroups(tribeId: string): Promise<readonly AdmissionNotificationGroupPreparationCommand[]> {
    return this.confirmed(async (database) => (await database.execute<{ id: string; version: number }>(sql`select notification_group.id,notification_group.version
      from public.admission_notification_groups notification_group
      join public.admission_notification_collection_progress progress on progress.tribe_id=notification_group.tribe_id
      where notification_group.tribe_id=${tribeId} and notification_group.state=${ADMISSION_NOTIFICATION_GROUP_STATE.open}
        and notification_group.window_closes_at<=progress.last_certified_through_at and notification_group.window_closes_at<=clock_timestamp()
      order by notification_group.window_closes_at,notification_group.id limit ${ADMISSION_NOTIFICATION_PRODUCER_LIMITS.groupsPerTribe}`)).rows.map((group) => ({ tribeId, groupId: group.id, expectedVersion: group.version })));
  }

  /** @returns Commit-confirmed new logical reminders using the original protected SQL owner, independent of optional email configuration. */
  materializeReminders(): Promise<number> {
    return this.confirmed(async (database) => (await database.execute<{ count: number }>(sql`select public.materialize_admission_notification_reminders(${ADMISSION_NOTIFICATION_PRODUCER_LIMITS.reminders}) as count`)).rows[0].count);
  }
}
