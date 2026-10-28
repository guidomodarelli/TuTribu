/** Attests immutable HMAC key routing before protected identity or original-intent comparisons. @module assert-messaging-key-material */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingMacKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR } from "../../constants/messaging-cryptography";
import { MESSAGING_KEY_MATERIAL_CONTINUITY } from "../../constants/messaging-key-material-continuity";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { MESSAGING_KEY_MATERIAL_DIAGNOSTIC } from "../../constants/messaging-key-enrollment";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** @returns Code-unit order of the entry keys, so proofs and fingerprints keep a stable order. */
function compareEntryKeys([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Contains only a domain-separated verifier, never exportable key material. */
type MessagingMacKeyMaterialProof = { key_id: string; verifier: string };

/** @param config - Private keys accessed only after native authorization. @param purpose - Fixed HMAC purpose. @returns Proofs for every active/retained id. @throws MessagingCryptographyError when recovery is locked or the active key is absent. */
async function createMaterialProofs(config: MessagingSecurityConfig, purpose: MessagingMacKeyPurpose): Promise<MessagingMacKeyMaterialProof[]> {
  if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  if (!config.keyrings[purpose].keys.has(config.keyrings[purpose].activeKeyId)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
  const proofs: MessagingMacKeyMaterialProof[] = [];
  for (const [keyId, key] of [...config.keyrings[purpose].keys].sort(compareEntryKeys)) {
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
  const results = (await database.execute<{ purpose: MessagingMacKeyPurpose; matches: boolean }>(sql`with proofs as materialized (select source.purpose,source.key_id,source.verifier from jsonb_to_recordset(${JSON.stringify(proofs)}::jsonb) as source(purpose text,key_id text,verifier text) order by source.purpose,source.key_id) select proofs.purpose,coalesce(bool_and(public.assert_authorized_messaging_key_material_proof(proofs.purpose,proofs.key_id,decode(proofs.verifier,'hex'))),false) as matches from proofs group by proofs.purpose`)).rows;
  const unverified = [...new Set(purposes)].filter((purpose) => !results.some((result) => result.purpose === purpose && result.matches));
  if (results.length === 0) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven);
  if (unverified.length > 0) {
    reportUnverifiedMacKeyMaterial(config, unverified);
    throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven);
  }
}

/**
 * Logs which purposes lack a matching enrolled proof, so operators can tell a missing enrollment from other closed failures.
 * Request roles cannot read the proof inventory, so an absent proof and a replaced key under an existing id share this event;
 * the private enrollment command tells them apart (it enrolls the first and refuses the second).
 * @param config - Current hosting keyrings; only key ids (routing metadata) are logged, never material or verifiers.
 * @param purposes - Purposes whose active or retained ids did not match an enrolled proof.
 */
function reportUnverifiedMacKeyMaterial(config: MessagingSecurityConfig, purposes: readonly MessagingMacKeyPurpose[]): void {
  createServerLogger({ feature: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.feature, operation: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.operation, requestId: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.requestId }).error({
    message: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.unverifiedMessage,
    metadata: {
      code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven,
      environment: config.environment,
      purposes: purposes.map((purpose) => ({ purpose, activeKeyId: config.keyrings[purpose].activeKeyId, keyIds: [...config.keyrings[purpose].keys.keys()].sort() })),
      remediation: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.remediation,
    },
  });
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
