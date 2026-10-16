/** Seeds an actual frozen private group and plain delivery metadata without credentials or any provider call. @module admission-notification-group-delivery-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { prepareAdmissionNotificationGroup, insertAdmissionNotificationGroup, insertAdmissionNotificationGroupMember, notificationFixtureTimestamp } from "./admission-notification-group-fixture";
import { freezeAdmissionNotificationGroup } from "@/src/modules/notifications/domain/policies/admission-notification-groups";

/** @param database - This run's verified owned branch, migrated by the original group fixture. @returns A real frozen group and its exact native source/deadline, without claiming prepared transport or dispatch authority. */
export async function prepareAdmissionNotificationGroupDelivery(database: AcademyAdmissionTestDatabase) {
  const group = await prepareAdmissionNotificationGroup(database), groupId = randomUUID(), connectionId = randomUUID();
  await insertAdmissionNotificationGroup(database, group, groupId);
  for (const obligationId of group.obligationIds.slice(0, 2)) await insertAdmissionNotificationGroupMember(database, group, groupId, obligationId);
  const plan = freezeAdmissionNotificationGroup(group.identity, group.candidates, group.nowMicroseconds);
  if (plan.status !== "frozen") throw new Error("Synthetic group origin requires its actual live frozen manifest");
  await database.withContext(group.own, async (transaction) => {
    await transaction.execute(sql`update public.admission_notification_groups set state='frozen',version=version+1,frozen_manifest=${JSON.stringify(plan.manifest)}::jsonb,deadline_at=${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)} where id=${groupId}`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id) values (${group.tribeId})`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${group.tribeId},${group.leaderId},'draft','synthetic-group-origin','synthetic-group-epoch',true,1)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${group.tribeId},1,'synthetic-group-origin','synthetic-group-epoch')`);
  });
  /** @param transaction - Original owner transaction, including deliberate rollback tests. @param input - Exact private scope variants; absence of group explicitly exercises a legacy obligation. @returns One real stored delivery ID, never a send receipt. */
  const insert = async (transaction: RequestDatabase, input: { id?: string; groupId?: string | null; audience?: string | null; recipientRef?: string; sourceId?: string; purpose?: string; deadlineOffsetMicroseconds?: number } = {}) => {
    const id = input.id ?? randomUUID(), notificationGroupId = input.groupId === undefined ? groupId : input.groupId;
    const sourceId = input.sourceId ?? notificationGroupId ?? group.obligationIds[1], recipientRef = input.recipientRef ?? group.leaderId;
    const deadline = sql`${notificationFixtureTimestamp(plan.deadlineAtMicroseconds)} + ${input.deadlineOffsetMicroseconds ?? 0}::integer*interval '1 microsecond'`;
    if (notificationGroupId === null) {
      await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,deadline_at) values (${id},${group.tribeId},${connectionId},1,'synthetic-group-origin','synthetic-group-epoch','admission_notification',${sourceId},${group.leaderId},${recipientRef},'email',${randomUUID()},${randomBytes(32)},'synthetic-origin-payload','{}'::jsonb,1,${deadline})`);
    } else {
      await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,notification_group_id,notification_group_audience,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,deadline_at) values (${id},${group.tribeId},${connectionId},1,'synthetic-group-origin','synthetic-group-epoch',${input.purpose ?? "admission_notification"},${sourceId},${notificationGroupId},${input.audience === undefined ? "reviewer" : input.audience},${group.leaderId},${recipientRef},'email',${randomUUID()},${randomBytes(32)},'synthetic-origin-payload','{}'::jsonb,1,${deadline})`);
    }
    return id;
  };
  return { ...group, groupId, connectionId, plan, insert };
}
