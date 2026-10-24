/** Restricts private MAC verification to previously reconciled immutable platform proofs. @module assert-reconciled-messaging-key-material */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingMacKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
import { MESSAGING_CRYPTO_ERROR } from "../../constants/messaging-cryptography";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { assertMessagingPrivateMacKeyMaterial } from "./assert-messaging-key-material";

/**
 * Verifies current material without permitting first-use enrollment by a routine backend operation.
 * The original helper can enroll an unused key id. This owner first locks every required existing proof;
 * their native immutability makes the subsequent original comparison take only its existing-proof path.
 * @param database - Original owner-only backend transaction, never an authenticated request principal.
 * @param config - Current external recovery state and active/retained nonextractable MAC keys.
 * @param purpose - Original-intent or contact identity purpose, never caller-controlled provider metadata.
 * @returns Only after every active/retained id exists and its original material verifies.
 * @throws MessagingCryptographyError when native scope, recovery state, key availability or prior reconciliation is insufficient.
 */
export async function assertReconciledMessagingPrivateMacKeyMaterial(database: RequestDatabase, config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<void> {
  const allowed = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  if (!allowed) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  const ring = config.keyrings[purpose], keyIds = [...ring.keys.keys()].sort();
  if (!ring.keys.has(ring.activeKeyId)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
  const proofs = (await database.execute<{ key_id: string }>(sql`select key_id from public.messaging_key_material_proofs where purpose=${purpose} and key_id in (${sql.join(keyIds.map((keyId) => sql`${keyId}`), sql`,`)}) order by key_id for share`)).rows;
  if (proofs.length !== keyIds.length) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven);
  await assertMessagingPrivateMacKeyMaterial(database, config, purpose);
}
