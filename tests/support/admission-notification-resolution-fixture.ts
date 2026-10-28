/** Composes an actual rejected admission and its optional email original on an owned branch. @module admission-notification-resolution-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistAdmission } from "./allowlist-admission-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { PostgresAdmissionNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-repository";
import { PostgresAdmissionNotificationGroupPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-group-preparation";
import { createAdmissionNotificationResourceAuthority } from "@/src/modules/notifications/infrastructure/messaging/admission-notification-resource-authority";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Confirms a real manual rejection after enabling a synthetic tested email resource.
 * @param database - Verified disposable branch with its real journal and current native guards.
 * @returns Committed request/decision/obligation, the prepared original and native execution ports; no provider request is made.
 */
export async function prepareAdmissionNotificationResolution(database: AcademyAdmissionTestDatabase) {
  const prepared = await prepareAllowlistAdmission(database);
  const { fixture, leader } = prepared;
  const connectionId = randomUUID(), secretRef = randomUUID(), senderId = randomUUID();
  const envelope = await createMessagingSecretCipher(fixture.config).seal(randomUUID(), { tribeId: fixture.tribeId, connectionId, connectionVersion: 1, resourceId: secretRef });
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`);
    await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,verification_daily_limit) values (${fixture.tribeId},0) on conflict (tribe_id) do nothing`);
    await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${fixture.tribeId},${fixture.userId},'degraded',${fixture.config.environment},${fixture.config.securityEpoch},false,null)`);
    await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,credential_validation_status,is_test_mode,email_sender_id) values (${connectionId},${fixture.tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch},${secretRef},'valid',false,${senderId})`);
    await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.tribeId},${connectionId},1,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
    await transaction.execute(sql`insert into public.messaging_connection_capabilities(connection_id,tribe_id,connection_version,channel,state,sender_id,checked_at,tested_at) values (${connectionId},${fixture.tribeId},1,'email','prepared',${senderId},clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`update public.tenant_messaging_connections set is_selected=true,selected_version=1,is_candidate=false,candidate_version=null,state='active' where id=${connectionId}`);
    await transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at,version,time_zone,changed_by_user_id) values (${fixture.tribeId},true,clock_timestamp(),1,'UTC',${fixture.userId})`);
  });

  const applicant = await prepared.applicant();
  const submitted = await applicant.commands.submit.execute({ ...applicant.input, expectedPolicyVersion: 3 });
  if (!submitted.ok || submitted.value.state !== "completed" || submitted.value.result.outcome !== "pending" || !submitted.value.result.admissionRequestId || !submitted.value.result.committedRequestVersion) throw new Error("Resolution fixture did not confirm its current pending request");
  const requestId = submitted.value.result.admissionRequestId;
  const rejected = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: submitted.value.result.committedRequestVersion, confirmed: true, decision: "reject", internalReason: "Synthetic private review reason", externalMessage: "Tu solicitud fue revisada." });
  if (!rejected.ok || rejected.value.state !== "completed") throw new Error("Resolution fixture did not confirm its actual rejection");
  const obligation = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and request_id=${requestId} and event_type='rejected'`)).rows.at(0));
  if (!obligation) throw new Error("Resolution fixture did not preserve its transactional rejection obligation");

  /** @param actorUserId - Current backend or original contributing leader. @param run - Native database-only operation. @returns The committed result through the same guarded transaction boundary. */
  const deliveryExecute = <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: actorUserId, email: null }, run);
  /** @param transaction - Current actor-bound transaction. @param tribeId - Exact requested tenant. @returns Current native leadership, never a caller-supplied role marker. */
  const authorizeCollection = async (transaction: RequestDatabase, tribeId: string) => Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active'`)).rows[0]);
  const readSecurityConfig = async () => fixture.config;
  const collected = await database.withContext(fixture.own, (transaction) => new PostgresAdmissionNotificationRepository(transaction, authorizeCollection, readSecurityConfig).collect({ tribeId: fixture.tribeId, obligationId: obligation.id, recipientUserId: applicant.userId, audience: "applicant" }));
  if (collected.status !== "collected") throw new Error("Resolution fixture did not collect its current applicant original");
  /** @param transaction - Backend-owned current transaction. @param tribeId - Exact original tenant. @returns Actual private execution capability for this fixture, with no request-level bypass. */
  const authorizePreparation = async (transaction: RequestDatabase, tribeId: string) => tribeId === fixture.tribeId && (await transaction.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  const preparation = new PostgresAdmissionNotificationGroupPreparation((run) => deliveryExecute(null, run), authorizePreparation, readSecurityConfig, "https://example.invalid");
  const queued = await preparation.prepare({ tribeId: fixture.tribeId, groupId: collected.groupId, expectedVersion: 1 });
  if (queued.status !== "queued" || !queued.deliveryId) throw new Error("Resolution fixture did not queue its complete applicant original");
  const guards = createAdmissionNotificationResourceAuthority(readSecurityConfig);
  return { fixture, applicant, requestId, obligationId: obligation.id, groupId: collected.groupId, deliveryId: queued.deliveryId, connectionId, deliveryExecute, readSecurityConfig, guards };
}
