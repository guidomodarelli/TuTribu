/** Seeds real tied source positions without any email readiness or trusted-account shortcut. @module admission-notification-source-selection-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationGroup, insertAdmissionNotificationGroup, insertAdmissionNotificationGroupMember, notificationFixtureTimestamp } from "./admission-notification-group-fixture";
import { createAdmissionRequestSnapshotFixture } from "./admission-request-snapshot-fixture";
import { MICROSECONDS_PER_SECOND, MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionNotificationSourceCursor, AdmissionNotificationSourcePosition } from "@/src/modules/notifications/domain/repositories/admission-notification-source-reader";
import type { AdmissionNotificationRecipientEmailScope } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";
import { PostgresAdmissionNotificationSourceReader } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-source-reader";

/** @param database - Owned branch receiving the full actual migration journal. @returns Coherent existing lineage and real source batch/read operations; no SDK, credential or destination is prepared. */
export async function prepareAdmissionNotificationSourceSelection(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionNotificationGroup(database), guardianId = randomUUID(), groupId = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianId},'Synthetic source guardian',${`${guardianId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${fixture.tribeId},${guardianId},'guardian','active')`);
  });
  await insertAdmissionNotificationGroup(database, fixture, groupId);
  await insertAdmissionNotificationGroupMember(database, fixture, groupId, fixture.obligationIds[1]);

  /** @param transaction - Original synthetic owner transaction. @param tribeId - Requested native scope. @returns Actual current canonical leadership, without trusting a caller's boolean role. */
  const authorize = async (transaction: RequestDatabase, tribeId: string) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active'`)).rows[0]);
  /** @param cursor - Original private continuation, or a new sweep. @param tribeId - Own or adversarial tenant. @param frontier - Last source examined by earlier sweeps. @returns The real adapter result after the guarded transaction finishes. */
  const read = (cursor: AdmissionNotificationSourceCursor | null, tribeId = fixture.tribeId, frontier: AdmissionNotificationSourcePosition | null = null) => database.withContext(fixture.own, (transaction) => new PostgresAdmissionNotificationSourceReader(transaction, authorize).readPage(tribeId, cursor, frontier));

  /** @param count - Synthetic obligations to create with tied original instants. @param originalMicroseconds - Optional exact historical clock; absence reads the native clock now. @returns Both recipients' actual scopes and original timestamp after atomic creation through production SQL primitives. */
  const createSources = (count: number, originalMicroseconds?: number) => database.withContext(fixture.own, async (transaction) => {
    const createdAtMicroseconds = originalMicroseconds ?? Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as instant`)).rows[0].instant);
    const rows = Array.from({ length: count }, () => {
      const userId = randomUUID(), requestId = randomUUID(), obligationId = randomUUID();
      return { user_id: userId, request_id: requestId, obligation_id: obligationId, snapshot: createAdmissionRequestSnapshotFixture({ id: requestId, tribeId: fixture.tribeId, userId, submittedAt: new Date(createdAtMicroseconds / MICROSECONDS_PER_SECOND * MILLISECONDS_PER_SECOND) }) };
    });
    const payload = JSON.stringify(rows);
    await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") select source.user_id,'Synthetic source applicant',source.user_id||'@example.invalid',false,clock_timestamp(),clock_timestamp() from jsonb_to_recordset(${payload}::jsonb) as source(user_id text)`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at) select source.request_id,${fixture.tribeId},source.user_id,'common',source.snapshot,${notificationFixtureTimestamp(createdAtMicroseconds)},${notificationFixtureTimestamp(createdAtMicroseconds)}+interval '30 days' from jsonb_to_recordset(${payload}::jsonb) as source(request_id uuid,user_id text,snapshot jsonb)`);
    await transaction.execute(sql`select public.create_admission_notification_obligation(source.obligation_id,${fixture.tribeId},source.request_id,source.user_id,'pending_created',null,${notificationFixtureTimestamp(createdAtMicroseconds)}) from jsonb_to_recordset(${payload}::jsonb) as source(obligation_id uuid,request_id uuid,user_id text)`);
    await transaction.execute(sql`select public.enqueue_admission_notification(source.obligation_id,recipient.user_id,'reviewer') from jsonb_to_recordset(${payload}::jsonb) as source(obligation_id uuid) cross join (values (${fixture.leaderId}::text),(${guardianId}::text)) as recipient(user_id)`);
    const sources: AdmissionNotificationRecipientEmailScope[] = rows.flatMap((source) => [fixture.leaderId, guardianId].map((recipientUserId) => ({ tribeId: fixture.tribeId, obligationId: source.obligation_id, recipientUserId, audience: "reviewer" })));
    return { sources, createdAtMicroseconds };
  });
  return { ...fixture, guardianId, groupId, authorize, read, createSources, tiedMicroseconds: fixture.nowMicroseconds - SECONDS_PER_MINUTE * MICROSECONDS_PER_SECOND + 137 };
}
