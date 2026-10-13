/** Composes the real protected issuer, marker and credential preparation for SQL pipeline scenarios. @module verification-delivery-pipeline-fixture */
import { sql } from "drizzle-orm";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import type { AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Seeds actual issuer and marker dependencies on one disposable branch.
 * @param database - This run's owned branch with protected transactions.
 * @param emailSenderId - Optional distinct sender written only during immutable resource creation.
 * @returns Current immutable resource, original issuance, real credential preparation and transaction observation.
 */
export async function prepareVerificationDeliveryPipeline(database: AcademyAdmissionTestDatabase, emailSenderId?: string) {
  const fixture = await prepareContactVerificationIssuer(database, "admission", false, emailSenderId);
  for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql"]) await database.applyMigration(migration);
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic pipeline issuance did not complete");
  const original = issued.result;
  let transactions = 0;
  /** @param actorUserId - Original owner or maintenance actor. @param run - Database-only callback. @returns Its committed result. */
  const execute = async <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => {
    transactions += 1;
    try { return await database.withContext({ userId: actorUserId, email: null }, run); }
    finally { transactions -= 1; }
  };
  const secrets = new PostgresEncryptedSecretStore(execute, { getAuthenticatedAccount: async () => null }, async () => fixture.config, "authorized_delivery");
  const preparation = new PostgresVerificationDeliveryPreparation(execute, secrets, async () => fixture.config);
  const repository = new PostgresMessageDeliveryRepository(execute, async () => true, async () => fixture.config);
  /** @returns Only safe original resource/attempt metadata, without any code, recipient or credential. */
  const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
    delivery: (await transaction.execute(sql`select id,state,connection_id,connection_version,last_outcome from public.message_deliveries where id=${original.deliveryId}`)).rows[0],
    attempts: (await transaction.execute(sql`select id,state,connection_id,connection_version,provider_message_id from public.message_delivery_attempts where delivery_id=${original.deliveryId} order by sequence`)).rows,
    reservations: (await transaction.execute(sql`select delivery_id,attempt_id,state from public.messaging_usage_reservations where delivery_id=${original.deliveryId}`)).rows,
  }));
  return { ...fixture, original, execute, secrets, preparation, repository, snapshot, get transactions() { return transactions; } };
}
