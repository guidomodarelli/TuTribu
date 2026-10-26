/** Seeds genuine pending ages and current reviewers for a private reminder worker. @module admission-notification-reminder-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { applyAdmissionMigrationJournal } from "./admission-migration-command";

/**
 * Creates two due scopes, one young request and one expired request without rewriting persisted dates.
 * @param database - Disposable PostgreSQL branch verified by the existing Native harness.
 * @returns Original identities and an unauthenticated maintenance context; no email configuration or credentials exist.
 */
export async function prepareAdmissionNotificationReminders(database: AcademyAdmissionTestDatabase) {
  await applyAdmissionMigrationJournal(database);
  const tribeId = randomUUID(), otherTribeId = randomUUID();
  const leaderId = randomUUID(), guardianId = randomUUID(), mutedGuardianId = randomUUID(), otherLeaderId = randomUUID();
  const applicantIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()], requestIds = applicantIds.map(() => randomUUID());
  const system = { userId: null, email: null };
  await database.withContext(system, async (transaction) => {
    for (const userId of [leaderId, guardianId, mutedGuardianId, otherLeaderId, ...applicantIds]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic reminder actor',${`${userId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic reminder tribe',${`reminder-${tribeId}`},${leaderId}),(${otherTribeId},'Other reminder tribe',${`reminder-${otherTribeId}`},${otherLeaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active'),(${tribeId},${mutedGuardianId},'guardian','muted'),(${otherTribeId},${otherLeaderId},'leader','active')`);
    for (const index of [0, 1, 2, 3]) {
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,submitted_at,expires_at) values (${requestIds[index]},${index === 3 ? otherTribeId : tribeId},${applicantIds[index]},'common',clock_timestamp()-${index === 1 ? 2 : 4}*interval '24 hours',clock_timestamp()+${index === 2 ? -1 : 480}*interval '1 hour')`);
    }
  });
  return { tribeId, otherTribeId, leaderId, guardianId, mutedGuardianId, otherLeaderId, applicantIds, requestIds, system };
}

/** @param database - Verified private branch. @param limit - Explicit bounded unit count. @returns Only the actual committed number after the guarded executor completes. */
export async function materializeAdmissionNotificationReminders(database: AcademyAdmissionTestDatabase, limit: number): Promise<number> {
  return database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ created: number }>(sql`select public.materialize_admission_notification_reminders(${limit}) as created`)).rows[0].created);
}
