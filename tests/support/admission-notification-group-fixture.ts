/** Seeds coherent historical open groups on a fully migrated owned PostgreSQL branch. @module admission-notification-group-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { executeAdmissionMigrationCommand } from "./admission-migration-command";
import { MICROSECONDS_PER_SECOND, SECONDS_PER_DAY, SECONDS_PER_HOUR } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_TIMING } from "@/src/modules/notifications/constants/admission-notification-groups";
import { createAdmissionNotificationWindow, planAdmissionNotificationEmailCandidate } from "@/src/modules/notifications/domain/policies/admission-notification-groups";
import type { AdmissionNotificationEmailCandidate, AdmissionNotificationGroupIdentity } from "@/src/modules/notifications/domain/entities/admission-notification";

/** @param microseconds - Exact synthetic native instant. @returns A real SQL timestamp without Date truncation, including a signed fractional remainder. */
export function notificationFixtureTimestamp(microseconds: number) {
  return sql`(to_timestamp(${Math.trunc(microseconds / MICROSECONDS_PER_SECOND)}::double precision)+${microseconds % MICROSECONDS_PER_SECOND}::integer*interval '1 microsecond')`;
}

/** @param database - Verified owned branch. @param allExpired - Seeds a coherent older collection whose two original deadlines elapsed. @returns Native source facts and a historical collection valid before its original window closed; no persisted dates are rewritten. */
export async function prepareAdmissionNotificationGroup(database: AcademyAdmissionTestDatabase, allExpired = false) {
  await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
  const tribeId = randomUUID(), otherTribeId = randomUUID(), leaderId = randomUUID(), otherLeaderId = randomUUID();
  const applicantIds = [randomUUID(), randomUUID(), randomUUID()], requestIds = applicantIds.map(() => randomUUID()), obligationIds = applicantIds.map(() => randomUUID());
  const own = { userId: leaderId, email: null };
  const nowMicroseconds = await database.withContext(own, async (transaction) => Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as instant`)).rows[0].instant));
  const hour = SECONDS_PER_HOUR * MICROSECONDS_PER_SECOND;
  const window = createAdmissionNotificationWindow("grouped", nowMicroseconds - (allExpired ? 3 : 1) * hour, "UTC", null)!;
  const collectionMicroseconds = window.startsAtMicroseconds + 1;
  const otherRequestCreatedAt = nowMicroseconds - 4 * SECONDS_PER_DAY * MICROSECONDS_PER_SECOND;
  const sourceTimes = allExpired ? [nowMicroseconds - 26 * hour, nowMicroseconds - 25 * hour, otherRequestCreatedAt] : [nowMicroseconds - ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds - 60 * MICROSECONDS_PER_SECOND, nowMicroseconds - 2 * hour, otherRequestCreatedAt];
  await database.withContext(own, async (transaction) => {
    for (const userId of [leaderId, otherLeaderId, ...applicantIds]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic group actor',${`${userId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic grouped notices',${`groups-${tribeId}`},${leaderId}),(${otherTribeId},'Other grouped notices',${`groups-${otherTribeId}`},${otherLeaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${otherTribeId},${otherLeaderId},'leader','active')`);
    for (const index of [0, 1, 2]) {
      const sourceTribeId = index === 2 ? otherTribeId : tribeId;
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,submitted_at,expires_at) values (${requestIds[index]},${sourceTribeId},${applicantIds[index]},'common',${notificationFixtureTimestamp(sourceTimes[index])},${notificationFixtureTimestamp(sourceTimes[index])}+interval '30 days')`);
      await transaction.execute(sql`select public.create_admission_notification_obligation(${obligationIds[index]},${sourceTribeId},${requestIds[index]},${applicantIds[index]},'pending_created',null,${notificationFixtureTimestamp(sourceTimes[index])})`);
      await transaction.execute(sql`select public.enqueue_admission_notification(${obligationIds[index]},${index === 2 ? otherLeaderId : leaderId},'reviewer')`);
    }
  });
  const candidates: AdmissionNotificationEmailCandidate[] = [0, 1].map((index) => {
    const result = planAdmissionNotificationEmailCandidate({
      nowMicroseconds: collectionMicroseconds,
      source: { id: obligationIds[index], tribeId, admissionRequestId: requestIds[index], applicantUserId: applicantIds[index], event: "pending_created", createdAtMicroseconds: sourceTimes[index] },
      request: { id: requestIds[index], tribeId, applicantUserId: applicantIds[index], status: "pending", submittedAtMicroseconds: sourceTimes[index], expiresAtMicroseconds: sourceTimes[index] + 30 * ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds },
      recipient: { userId: leaderId, audience: "reviewer", currentRole: "leader", membershipStatus: "active", preference: null },
      emailSettings: { tribeId, enabled: true, version: 1, enabledAtMicroseconds: Math.min(...sourceTimes) - 1, timeZone: "UTC" },
      availability: { tribeId, recipientUserId: leaderId, trustedAccountEmailAvailable: true, preparedEmailConnectionAvailable: true }, dailyWindow: null,
    });
    if (result.status !== "candidate") throw new Error(`Original synthetic group collection was ineligible: ${result.reason}`);
    return result.candidate;
  });
  return { tribeId, otherTribeId, leaderId, otherLeaderId, applicantIds, obligationIds, requestIds, sourceTimes, own, nowMicroseconds, collectionMicroseconds, identity: candidates[0].identity, candidates };
}

/** @param database - Owned branch. @param fixture - Original coherent sources and recipient. @param groupId - New group UUID. @param identity - Exact original candidate identity. @returns After storing its scoped open record through real SQL. */
export async function insertAdmissionNotificationGroup(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAdmissionNotificationGroup>>, groupId: string, identity: AdmissionNotificationGroupIdentity = fixture.identity) {
  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.admission_notification_groups(id,tribe_id,recipient_user_id,audience,mode,preference_version,email_settings_version,time_zone,window_starts_at,window_closes_at,individual_obligation_id,created_at) values (${groupId},${identity.tribeId},${identity.recipientUserId},${identity.audience},${identity.mode},${identity.preferenceVersion},${identity.emailSettingsVersion},${identity.window.timeZone},${notificationFixtureTimestamp(identity.window.startsAtMicroseconds)},${notificationFixtureTimestamp(identity.window.closesAtMicroseconds)},${identity.individualObligationId},${notificationFixtureTimestamp(fixture.collectionMicroseconds)})`));
}

/** @param database - Owned branch. @param fixture - Exact existing scope. @param groupId - Current original open group. @param obligationId - One source whose scoped FK must match. @returns After a real immutable member insertion. */
export async function insertAdmissionNotificationGroupMember(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAdmissionNotificationGroup>>, groupId: string, obligationId: string) {
  await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.admission_notification_group_members(group_id,tribe_id,recipient_user_id,audience,obligation_id) values (${groupId},${fixture.tribeId},${fixture.leaderId},'reviewer',${obligationId})`));
}
