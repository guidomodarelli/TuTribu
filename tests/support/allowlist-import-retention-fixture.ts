/** Seeds original temporary-import lifetimes and minimal result history without mutating dates after creation. @module allowlist-import-retention-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationDatabase } from "./contact-verification-database-fixture";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MILLISECONDS_PER_SECOND, SECONDS_PER_HOUR } from "@/src/constants/time";
import { applyAdmissionRetentionHistoricalPrefix } from "./admission-retention-migration-prefix";
import { applyAdmissionMigrationJournal } from "./admission-migration-command";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

/** Names the original state and immutable identities used by SQL assertions. */
export type ImportRetentionFixtureCase = { name: "fresh" | "completed" | "processing"; tribeId: string; importId: string; operationId: string };

/** @param database - Exact owned disposable branch. @returns Only scoped identities and original metadata; no contacts, names or protected bytes. */
export async function prepareAllowlistImportRetention(database: AcademyAdmissionTestDatabase) {
  await applyAdmissionRetentionHistoricalPrefix(database);
  const security = await seedContactVerificationDatabase(database);
  const fixture = await seedAllowlistImportRetention(database, security);
  await applyAdmissionMigrationJournal(database);
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    await registerMessagingPrivateMacKeyMaterial(transaction, security.config, MESSAGING_KEY_PURPOSE.operationPayload);
    await registerMessagingPrivateMacKeyMaterial(transaction, security.config, MESSAGING_KEY_PURPOSE.contactFingerprint);
  });
  return fixture;
}

/** @param database - Already migrated owned branch. @param security - Synthetic account/configuration for original fixture fingerprints. @returns Independent imports and snapshots without replaying historical migrations. */
export async function seedAllowlistImportRetention(database: AcademyAdmissionTestDatabase, security: Pick<Awaited<ReturnType<typeof prepareContactVerificationDatabase>>, "own" | "config">) {
  const userId = randomUUID(), own = { userId, email: `${userId}@example.test` };
  await database.withContext(security.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Responsable de importaciones de ejemplo',${own.email},false,transaction_timestamp()-interval '5 days',transaction_timestamp()-interval '5 days')`));
  const cases: ImportRetentionFixtureCase[] = [];
  for (const name of ["fresh", "completed", "processing"] as const) {
    const tribeId = randomUUID(), importId = randomUUID(), operationId = randomUUID();
    await database.withContext(own, async (transaction) => {
      const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const createdAt = new Date(now.getTime() - ADMISSION_LIMIT.csvRetentionMs + (name === "fresh" ? 6 : -1) * SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND), expiresAt = new Date(createdAt.getTime() + ADMISSION_LIMIT.csvRetentionMs), markerAt = new Date(createdAt.getTime() + MILLISECONDS_PER_SECOND);
      await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Academia de importación de ejemplo',${`retention-${tribeId}`},${userId},${new Date(now.getTime() - 4 * ADMISSION_LIMIT.csvRetentionMs)})`);
      await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,created_at) values (${tribeId},${userId},'leader','active',${new Date(now.getTime() - 3 * ADMISSION_LIMIT.csvRetentionMs)})`);
      const completedRows = name === "completed" ? 3 : name === "processing" ? 1 : 0;
      await transaction.execute(sql`insert into public.academy_admission_operations(id,actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,public_result,created_at,completed_at) values (${operationId},${userId},${tribeId},'confirm_allowlist_import',${randomUUID()},${randomBytes(MESSAGING_CRYPTO.keyBytes)},${security.config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].activeKeyId},${name === "completed" ? "completed" : "started"},${name === "completed" ? JSON.stringify({ importId, counts: { selected: 3, added: 3 } }) : null}::jsonb,${markerAt},${name === "completed" ? markerAt : null})`);
      await transaction.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,created_at,expires_at,purge_after,state,selected_rows,completed_rows,active_operation_id) values (${importId},${tribeId},${userId},'email',1,${randomBytes(MESSAGING_CRYPTO.keyBytes)},${security.config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].activeKeyId},${security.config.environment},${security.config.securityEpoch},${createdAt},${expiresAt},${expiresAt},${name === "fresh" ? "processing" : name},array[1,2,3],${completedRows},${operationId})`);
      await transaction.execute(sql`insert into public.academy_allowlist_import_selections(operation_id,import_id,tribe_id,actor_user_id,expected_version,selected_rows,accepted_at) values (${operationId},${importId},${tribeId},${userId},1,array[1,2,3],${markerAt})`);
      for (const rowNumber of [1, 2, 3]) {
        const contact = { type: "email" as const, value: `${randomUUID()}@example.test` }, displayName = `Grupo de ejemplo ${rowNumber}`, entryId = rowNumber <= completedRows ? randomUUID() : null;
        const fingerprint = await createAdmissionContactFingerprint(contact, security.config);
        if (entryId) await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,import_id,created_by_user_id,created_at,updated_at) values (${entryId},${tribeId},${contact.type},${contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${displayName},'import',${importId},${userId},${markerAt},${markerAt})`);
        await transaction.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result,outcome,entry_id,entry_version,confirmed_operation_id,committed_at) values (${importId},${tribeId},${rowNumber},${JSON.stringify({ identity: contact.value, display_name: displayName })}::jsonb,${JSON.stringify({ contact, displayName, errors: [], duplicateOf: null, observedEntry: null })}::jsonb,${entryId ? "added" : null},${entryId},${entryId ? 1 : null},${entryId ? operationId : null},${entryId ? markerAt : null})`);
      }
    });
    cases.push({ name, tribeId, importId, operationId });
  }
  /** @returns Original references and counts without temporary file/report material. */
  const snapshot = () => database.withContext(own, async (transaction) => ({
    imports: (await transaction.execute(sql`select id,state,version,selected_rows,completed_rows,created_at::text,expires_at::text,purge_after::text,active_operation_id from public.academy_allowlist_imports where actor_user_id=${userId} order by id`)).rows,
    rows: (await transaction.execute(sql`select row.import_id,row.row_number,row.outcome,row.entry_id,row.entry_version,row.confirmed_operation_id,row.committed_at::text,row.input_data<>'{}'::jsonb as has_input,row.validation_result<>'{}'::jsonb as has_validation from public.academy_allowlist_import_rows row join public.academy_allowlist_imports preview on preview.id=row.import_id where preview.actor_user_id=${userId} order by row.import_id,row.row_number`)).rows,
    entries: (await transaction.execute(sql`select id,import_id,status,version,created_at::text,updated_at::text from public.academy_allowlist_entries where created_by_user_id=${userId} order by id`)).rows,
    operations: (await transaction.execute(sql`select id,state,version,public_result,created_at::text,completed_at::text from public.academy_admission_operations where actor_user_id=${userId} order by id`)).rows,
    selections: (await transaction.execute(sql`select operation_id,import_id,expected_version,selected_rows,accepted_at::text from public.academy_allowlist_import_selections where actor_user_id=${userId} order by operation_id`)).rows,
  }));
  return { own, userId, cases, snapshot };
}
