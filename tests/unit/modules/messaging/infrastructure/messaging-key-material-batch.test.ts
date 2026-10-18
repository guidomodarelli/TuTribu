/** @vitest-environment node */
/** Exercises grouped immutable proof checks using real PostgreSQL roles and native Web Crypto keys. */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { ADMISSION_OPERATION_MAC_KEY_PURPOSES } from "@/src/modules/academy-admissions/constants/admission-operation";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import {
  assertMessagingAuthenticatedMacKeyMaterial,
  assertMessagingAuthenticatedMacKeyMaterials,
  registerMessagingPrivateMacKeyMaterial,
} from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

/** @returns Independent nonextractable native material for a deliberate immutable-id mismatch. */
const createKey = () => crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native grouped key material", () => {
  it("should check every purpose and retained key without enrollment or opening keys for an absent actor", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const attest = (config: typeof fixture.config) => database.withContext(fixture.own, (transaction) => assertMessagingAuthenticatedMacKeyMaterials(transaction, config, ADMISSION_OPERATION_MAC_KEY_PURPOSES), "non_bypass");
      const snapshot = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select purpose,key_id,created_at::text from public.messaging_key_material_proofs order by purpose,key_id`)).rows);
      const before = await snapshot();

      expect(database.nonBypassRole).toMatchObject({ bypassesRls: false, isSuperuser: false });
      await expect(attest(fixture.config)).resolves.toBeUndefined();
      for (const purpose of ADMISSION_OPERATION_MAC_KEY_PURPOSES) {
        const ring = fixture.config.keyrings[purpose];
        const changed = { ...fixture.config, keyrings: { ...fixture.config.keyrings, [purpose]: { ...ring, keys: new Map([[ring.activeKeyId, await createKey()]]) } } };
        await expect(attest(changed)).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
        const missingActive = { ...fixture.config, keyrings: { ...fixture.config.keyrings, [purpose]: { ...ring, keys: new Map<string, CryptoKey>() } } };
        await expect(attest(missingActive)).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyUnavailable });
        await database.withContext(fixture.own, (transaction) => assertMessagingAuthenticatedMacKeyMaterial(transaction, fixture.config, purpose), "non_bypass");
      }
      expect(await snapshot()).toEqual(before);

      let keyringReads = 0;
      const observeConfig = (recoveryLocked = fixture.config.recoveryLocked) => ({ ...fixture.config, recoveryLocked, get keyrings() { keyringReads += 1; return fixture.config.keyrings; } });
      for (const userId of [null, randomUUID()]) {
        await expect(database.withContext({ userId, email: null }, (transaction) => assertMessagingAuthenticatedMacKeyMaterials(transaction, observeConfig(), ADMISSION_OPERATION_MAC_KEY_PURPOSES), "non_bypass")).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.contextMismatch });
      }
      await expect(attest(observeConfig(true))).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.recoveryLocked });
      expect(keyringReads).toBe(0);
      await expect(database.withContext(fixture.own, (transaction) => assertMessagingAuthenticatedMacKeyMaterials(transaction, fixture.config, []), "non_bypass")).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });

      const retainedKeyId = randomUUID(), purpose = MESSAGING_KEY_PURPOSE.contactFingerprint, ring = fixture.config.keyrings[purpose];
      const retainedKeys = new Map(ring.keys);
      retainedKeys.set(retainedKeyId, await createKey());
      const retained = { ...fixture.config, keyrings: { ...fixture.config.keyrings, [purpose]: { ...ring, keys: retainedKeys } } };
      await expect(attest(retained)).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
      expect(await snapshot()).toEqual(before);
      await database.withContext({ userId: null, email: null }, (transaction) => registerMessagingPrivateMacKeyMaterial(transaction, retained, purpose));
      const enrolled = await snapshot();
      expect(enrolled).toHaveLength(before.length + 1);
      await expect(attest(retained)).resolves.toBeUndefined();
      const changedRetainedKeys = new Map(retainedKeys);
      changedRetainedKeys.set(retainedKeyId, await createKey());
      await expect(attest({ ...retained, keyrings: { ...retained.keyrings, [purpose]: { ...ring, keys: changedRetainedKeys } } })).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
      expect(await snapshot()).toEqual(enrolled);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
