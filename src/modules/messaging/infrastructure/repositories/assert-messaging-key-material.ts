/** Attests immutable HMAC key routing before protected identity or original-intent comparisons. @module assert-messaging-key-material */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingMacKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR } from "../../constants/messaging-cryptography";
import { MESSAGING_KEY_MATERIAL_CONTINUITY } from "../../constants/messaging-key-material-continuity";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";

/** Contains only a domain-separated verifier, never exportable key material. */
type MessagingMacKeyMaterialProof = { key_id: string; verifier: string };

/** @param config - Private keys accessed only after native authorization. @param purpose - Fixed HMAC purpose. @returns Proofs for every active/retained id. @throws MessagingCryptographyError when recovery is locked or the active key is absent. */
async function createMaterialProofs(config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<MessagingMacKeyMaterialProof[]> {
  if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  if (!config.keyrings[purpose].keys.has(config.keyrings[purpose].activeKeyId)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
  const proofs: MessagingMacKeyMaterialProof[] = [];
  for (const [keyId, key] of [...config.keyrings[purpose].keys].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const bytes = new TextEncoder().encode(JSON.stringify([MESSAGING_KEY_MATERIAL_CONTINUITY.proofDomain, purpose, keyId]));
    const proof = new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, bytes));
    proofs.push({ key_id: keyId, verifier: Buffer.from(proof).toString("hex") });
  }
  return proofs;
}

/** @param config - Current own private keys after native authorization. @param purpose - Fixed HMAC purpose. @param attest - Own SQL boundary accepting only a proof, never key/contact material. @returns After every active/retained id matches its immutable original. @throws MessagingCryptographyError before deriving another identity when an id changes material. */
async function assertMaterial(config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose, attest: (proofs: readonly MessagingMacKeyMaterialProof[]) => Promise<boolean>): Promise<void> {
  if (!await attest(await createMaterialProofs(config, purpose))) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven);
}

/** @param database - Native account-authorized original transaction. @param config - Current external HMAC keys. @param purpose - Fixed identity or payload purpose. @returns Without selecting a key when native identity is absent. @throws MessagingCryptographyError for missing identity or an immutable-id mismatch. */
export async function assertMessagingAuthenticatedMacKeyMaterial(database: RequestDatabase, config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<void> {
  await assertMessagingAuthenticatedMacKeyMaterials(database, config, [purpose]);
}

/**
 * Attests several independent HMAC purposes in one SQL comparison after native identity validation.
 * @param database - Original account-authorized transaction retaining its authority locks.
 * @param config - Current external keys; never inspected before native authorization succeeds.
 * @param purposes - Fixed HMAC purposes required by the calling owner.
 * @returns After every active and retained key matches its previously enrolled immutable proof.
 * @throws MessagingCryptographyError for absent authority, unavailable material, an empty set or any mismatch.
 */
export async function assertMessagingAuthenticatedMacKeyMaterials(database: RequestDatabase, config: MessagingSecurityConfig, purposes: readonly MessagingMacKeyPurpose[]): Promise<void> {
  const allowed = (await database.execute<{ allowed: boolean }>(sql`select public.messaging_key_material_context_is_current() as allowed`)).rows[0].allowed;
  if (!allowed) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  const proofs: (MessagingMacKeyMaterialProof & { purpose: MessagingMacKeyPurpose })[] = [];
  for (const purpose of purposes) {
    for (const proof of await createMaterialProofs(config, purpose)) proofs.push({ ...proof, purpose });
  }
  const matches = (await database.execute<{ matches: boolean }>(sql`with proofs as materialized (select source.purpose,source.key_id,source.verifier from jsonb_to_recordset(${JSON.stringify(proofs)}::jsonb) as source(purpose text,key_id text,verifier text) order by source.purpose,source.key_id) select coalesce(bool_and(public.assert_authorized_messaging_key_material_proof(proofs.purpose,proofs.key_id,decode(proofs.verifier,'hex'))),false) as matches from proofs`)).rows[0].matches;
  if (!matches) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven);
}

/** @param database - Explicit owner-only backend rotation transaction. @param config - Current external HMAC keys. @param purpose - Fixed original-intent or contact purpose. @returns Only after native backend context and immutable attestations pass. @throws MessagingCryptographyError before key selection for a human/request context. */
export async function assertMessagingPrivateMacKeyMaterial(database: RequestDatabase, config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<void> {
  const allowed = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  if (!allowed) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  await assertMaterial(config, purpose, async (proofs) => (await database.execute<{ matches: boolean }>(sql`with proofs as materialized (select source.key_id,source.verifier from jsonb_to_recordset(${JSON.stringify(proofs)}::jsonb) as source(key_id text,verifier text) order by source.key_id) select coalesce(bool_and(public.check_messaging_key_material_proof(${purpose},proofs.key_id,decode(proofs.verifier,'hex'))),false) as matches from proofs`)).rows[0].matches);
}

/**
 * Registers externally reconciled original material; routine requests/rotation use the stricter checks above.
 * @param database - Owner-only backend enrollment transaction, never a request principal.
 * @param config - Original material established by the private platform rollout/reconciliation procedure.
 * @param purpose - Fixed contact or original-intent HMAC purpose.
 * @returns After immutable enrollment, without replacing an existing proof.
 * @throws MessagingCryptographyError for request context or a material mismatch.
 */
export async function registerMessagingPrivateMacKeyMaterial(database: RequestDatabase, config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<void> {
  const allowed = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.assert_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  if (!allowed) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  await assertMaterial(config, purpose, async (proofs) => (await database.execute<{ matches: boolean }>(sql`with proofs as materialized (select source.key_id,source.verifier from jsonb_to_recordset(${JSON.stringify(proofs)}::jsonb) as source(key_id text,verifier text) order by source.key_id) select coalesce(bool_and(public.assert_messaging_key_material_proof(${purpose},proofs.key_id,decode(proofs.verifier,'hex'))),false) as matches from proofs`)).rows[0].matches);
}
