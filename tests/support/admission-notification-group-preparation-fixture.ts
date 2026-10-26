/** Composes real collection/preparation fixtures without forging provider receipts or rewriting native history. @module admission-notification-group-preparation-fixture */
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAdmissionNotificationCollectionProgress } from "./admission-notification-collection-progress-fixture";
import { ADMISSION_NOTIFICATION_GROUP_TEST_WAIT_SLICE_MS, ADMISSION_NOTIFICATION_GROUP_TEST_COLLECTION_HEADROOM_MICROSECONDS } from "./constants/admission-notification-validation";
import { MICROSECONDS_PER_SECOND, MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { ADMISSION_NOTIFICATION_TIMING } from "@/src/modules/notifications/constants/admission-notification-groups";
import { PostgresAdmissionNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-repository";
import { PostgresAdmissionNotificationGroupPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-group-preparation";
import type { AdmissionNotificationGroupPreparationCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-group-preparation";
import type { AdmissionNotificationCollectionExecutor, AdmissionNotificationCollectionAuthorizer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @param database - Fully owned branch with actual storage, cryptography and native guards. @returns Current protected preparation and genuine sources, with no SDK or live message. */
export async function prepareAdmissionNotificationGroupsForEmail(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionNotificationCollectionProgress(database);
  const preparationExecute: AdmissionNotificationCollectionExecutor = (run) => database.withContext(fixture.system, run);
  const preparationAuthorize: AdmissionNotificationCollectionAuthorizer = async (transaction, tribeId) => tribeId === fixture.tribeId && (await transaction.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  // Explicit fixture platform enrollment is separate from routine preparation, which only checks reconciled proofs.
  await preparationExecute((transaction) => registerMessagingPrivateMacKeyMaterial(transaction, fixture.keys.config, MESSAGING_KEY_PURPOSE.operationPayload));
  const preparation = new PostgresAdmissionNotificationGroupPreparation(preparationExecute, preparationAuthorize, async () => fixture.keys.config, "https://example.invalid");
  /** @param obligationId - Existing real source. @param recipientUserId - Existing scoped notice recipient. @returns Its actual committed logical group. */
  const collect = async (obligationId: string, recipientUserId: string = fixture.leaderId) => {
    const result = await fixture.execute((transaction) => new PostgresAdmissionNotificationRepository(transaction, fixture.authorize, async () => fixture.keys.config).collect({ tribeId: fixture.tribeId, obligationId, recipientUserId, audience: "reviewer" }));
    if (result.status !== "collected") throw new Error("Native notification preparation fixture did not collect its original source");
    return { tribeId: fixture.tribeId, groupId: result.groupId, expectedVersion: 1 } satisfies AdmissionNotificationGroupPreparationCommand;
  };
  /** @returns Current genuine PostgreSQL clock in exact microseconds. */
  const now = () => fixture.execute(async (transaction) => Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from clock_timestamp())*${MICROSECONDS_PER_SECOND})::bigint::text as instant`)).rows[0].instant));
  /** @param untilMicroseconds - Real original group boundary or future collection headroom. @returns Only when actual PostgreSQL time reaches the target, without holding a transaction or mutating persisted clocks. */
  const waitUntil = async (untilMicroseconds: number) => {
    for (;;) {
      const remainingMicroseconds = untilMicroseconds - await now();
      if (remainingMicroseconds <= 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(ADMISSION_NOTIFICATION_GROUP_TEST_WAIT_SLICE_MS, Math.ceil(remainingMicroseconds / MICROSECONDS_PER_SECOND * MILLISECONDS_PER_SECOND))));
    }
  };
  /** @returns A real collection opportunity with at least three minutes left, avoiding a flaky split across two buckets during native network waits. */
  const waitForCollectionWindow = async () => {
    const instant = await now(), closes = Math.floor(instant / ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds) * ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds + ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds;
    if (closes - instant < ADMISSION_NOTIFICATION_GROUP_TEST_COLLECTION_HEADROOM_MICROSECONDS) await waitUntil(closes);
  };
  return { ...fixture, preparation, preparationExecute, preparationAuthorize, collect, now, waitUntil, waitForCollectionWindow };
}
