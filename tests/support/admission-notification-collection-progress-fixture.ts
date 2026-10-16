/** Seeds genuine email collection and committed page operations on one owned branch. @module admission-notification-collection-progress-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationCollection } from "./admission-notification-collection-fixture";
import { createAdmissionRequestSnapshotFixture } from "./admission-request-snapshot-fixture";
import { notificationFixtureTimestamp } from "./admission-notification-group-fixture";
import { MICROSECONDS_PER_SECOND, MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { PostgresAdmissionNotificationCollectionProgress, type AdmissionNotificationCollectionExecutor, type AdmissionNotificationCollectionAuthorizer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";

/** @param database - Actual fully migrated branch and native commit owner. @returns Protected own callbacks and genuine fresh sources; no SDK or transport receipt is fabricated. */
export async function prepareAdmissionNotificationCollectionProgress(database: AcademyAdmissionTestDatabase) {
  const { fixture, keys, connectionId } = await prepareAdmissionNotificationCollection(database);
  const execute: AdmissionNotificationCollectionExecutor = (run) => database.withContext(fixture.own, run);
  const authorize: AdmissionNotificationCollectionAuthorizer = async (transaction, tribeId) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active'`)).rows[0]);
  const repository = new PostgresAdmissionNotificationCollectionProgress(execute, authorize, async () => keys.config);
  /** @param count - New pending requests with independent applicants and two actual reviewers. @returns Committed original source references and exact creation time after email enablement. */
  const createSources = (count: number) => execute(async (transaction) => {
    const createdAtMicroseconds = Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as instant`)).rows[0].instant);
    const sources = Array.from({ length: count }, () => {
      const userId = randomUUID(), requestId = randomUUID(), obligationId = randomUUID();
      return { user_id: userId, request_id: requestId, obligation_id: obligationId, snapshot: createAdmissionRequestSnapshotFixture({ id: requestId, tribeId: fixture.tribeId, userId, submittedAt: new Date(createdAtMicroseconds / MICROSECONDS_PER_SECOND * MILLISECONDS_PER_SECOND) }) };
    });
    const payload = JSON.stringify(sources);
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") select source.user_id,'Synthetic page applicant',source.user_id||'@example.invalid',false,clock_timestamp(),clock_timestamp() from jsonb_to_recordset(${payload}::jsonb) as source(user_id text)`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at) select source.request_id,${fixture.tribeId},source.user_id,'common',source.snapshot,${notificationFixtureTimestamp(createdAtMicroseconds)},${notificationFixtureTimestamp(createdAtMicroseconds)}+interval '30 days' from jsonb_to_recordset(${payload}::jsonb) as source(request_id uuid,user_id text,snapshot jsonb)`);
    await transaction.execute(sql`select public.create_admission_notification_obligation(source.obligation_id,${fixture.tribeId},source.request_id,source.user_id,'pending_created',null,${notificationFixtureTimestamp(createdAtMicroseconds)}) from jsonb_to_recordset(${payload}::jsonb) as source(obligation_id uuid,request_id uuid,user_id text)`);
    await transaction.execute(sql`select public.enqueue_admission_notification(source.obligation_id,recipient.user_id,'reviewer') from jsonb_to_recordset(${payload}::jsonb) as source(obligation_id uuid) cross join (values (${fixture.leaderId}::text),(${fixture.guardianId}::text)) as recipient(user_id)`);
    return { sources, createdAtMicroseconds };
  });
  return { ...fixture, keys, connectionId, execute, authorize, repository, createSources };
}
