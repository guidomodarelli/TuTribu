/** @vitest-environment node */
/** Exercises the private hosting-key enrollment command against real PostgreSQL proofs and native Web Crypto keys. */
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { applyAdmissionMigrationJournal } from "@/tests/support/admission-migration-command";
import { seedContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { ADMISSION_OPERATION_MAC_KEY_PURPOSES } from "@/src/modules/academy-admissions/constants/admission-operation";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { MESSAGING_ENROLLED_MAC_KEY_PURPOSES, MESSAGING_KEY_ENROLLMENT_ERROR, MESSAGING_KEY_MATERIAL_DIAGNOSTIC } from "@/src/modules/messaging/constants/messaging-key-enrollment";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { describeMessagingKeyEnrollmentFailure, enrollHostingMessagingKeyMaterials, enrollMessagingKeyMaterials } from "@/src/modules/messaging/infrastructure/operations/enroll-messaging-key-materials";
import { assertMessagingAuthenticatedMacKeyMaterials } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

const runExecutable = promisify(execFile);
const COMMAND_PATH = join(process.cwd(), "scripts", "enroll-messaging-key-materials.mjs");
const INHERITED_SECRET_KEYS = ["DATABASE_URL", "DATABASE_MIGRATION_URL", "DATABASE_MAINTENANCE_URL", ...Object.values(MESSAGING_HOSTING_ENV)];

type HostingKeyrings = Record<string, { activeKeyId: string; keys: { id: string; materialBase64: string }[] }>;
type CommandOutcome = { exitCode: number; stdout: string; stderr: string };

/** @returns Fresh synthetic keyrings for every purpose, none of them enrolled anywhere. */
function createHostingKeyrings(): HostingKeyrings {
  return Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => {
    const id = `${purpose}-${randomUUID()}`;
    return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") }] }];
  }));
}

/** @param keyrings - Synthetic hosting keyrings. @param securityEpoch - Shared synthetic epoch. @returns The hosting secrets exactly as a deployment provides them. */
function createHostingEnvironment(keyrings: HostingKeyrings, securityEpoch: string): Record<string, string> {
  return {
    [MESSAGING_HOSTING_ENV.environment]: "synthetic-key-enrollment",
    [MESSAGING_HOSTING_ENV.securityEpoch]: securityEpoch,
    [MESSAGING_HOSTING_ENV.recoveryLock]: MESSAGING_RECOVERY_LOCK_VALUE.unlocked,
    [MESSAGING_HOSTING_ENV.keyrings]: JSON.stringify(keyrings),
  };
}

/** @param environment - Only the variables the operator would export. @returns The real command's exit code and output, without inheriting this process's database or messaging secrets. */
async function runEnrollmentCommand(environment: Record<string, string>): Promise<CommandOutcome> {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !INHERITED_SECRET_KEYS.includes(key)));
  try {
    const { stdout, stderr } = await runExecutable(process.execPath, [COMMAND_PATH], { env: { ...inherited, ...environment } as NodeJS.ProcessEnv, windowsHide: true });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

/** @param keyrings - Synthetic hosting keyrings. @returns Every base64 key material, which no output may contain. */
const listMaterials = (keyrings: HostingKeyrings) => Object.values(keyrings).flatMap((ring) => ring.keys.map((key) => key.materialBase64));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messaging key enrollment command", () => {
  it("should refuse a request-role-only environment before reading any keyring", async () => {
    await expect(enrollHostingMessagingKeyMaterials({ DATABASE_URL: "postgres://runtime@127.0.0.1:1/app", ...createHostingEnvironment(createHostingKeyrings(), randomUUID()) }))
      .rejects.toMatchObject({ code: MESSAGING_KEY_ENROLLMENT_ERROR.connectionMissing });
  });

  it("should project only stable codes and SQLSTATE values from failures", () => {
    expect(describeMessagingKeyEnrollmentFailure(new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyContinuityUnproven))).toEqual({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
    expect(describeMessagingKeyEnrollmentFailure(Object.assign(new Error("connect postgres://owner:secret@host/db failed"), { code: "42501" }))).toEqual({ code: MESSAGING_KEY_ENROLLMENT_ERROR.unexpectedFailure, sqlState: "42501" });
    expect(describeMessagingKeyEnrollmentFailure(Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }))).toEqual({ code: MESSAGING_KEY_ENROLLMENT_ERROR.unexpectedFailure });
  });
});

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native messaging key enrollment", () => {
  it("should refuse unenrolled hosting keys, enroll them once through the operator command and keep a second run unchanged", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await applyAdmissionMigrationJournal(database);
      const keyrings = createHostingKeyrings(), securityEpoch = randomUUID();
      const hosting = createHostingEnvironment(keyrings, securityEpoch);
      const config = await readMessagingHostingSecurityConfig(hosting);
      const fixture = await seedContactVerificationDatabase(database, config);
      const attest = () => database.withContext(fixture.own, (transaction) => assertMessagingAuthenticatedMacKeyMaterials(transaction, config, ADMISSION_OPERATION_MAC_KEY_PURPOSES), "non_bypass");
      const snapshot = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select purpose,key_id,encode(verifier,'hex') as verifier,created_at::text from public.messaging_key_material_proofs order by purpose,key_id`)).rows);
      const errorLog = vi.spyOn(console, "error");

      await expect(attest()).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
      const diagnostics = errorLog.mock.calls.map(([entry]) => String(entry)).filter((entry) => entry.includes(MESSAGING_KEY_MATERIAL_DIAGNOSTIC.unverifiedMessage));
      expect(diagnostics).toHaveLength(1);
      expect(JSON.parse(diagnostics[0])).toMatchObject({
        level: "error",
        message: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.unverifiedMessage,
        metadata: {
          code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven,
          remediation: MESSAGING_KEY_MATERIAL_DIAGNOSTIC.remediation,
          purposes: [...ADMISSION_OPERATION_MAC_KEY_PURPOSES].map((purpose) => ({ purpose, activeKeyId: keyrings[purpose].activeKeyId, keyIds: [keyrings[purpose].activeKeyId] })),
        },
      });
      for (const material of listMaterials(keyrings)) expect(diagnostics[0]).not.toContain(material);

      await expect(database.withContext(fixture.own, (transaction) => enrollMessagingKeyMaterials(transaction, config), "non_bypass")).rejects.toMatchObject({ code: MESSAGING_CRYPTO_ERROR.contextMismatch });
      const before = await snapshot();

      await database.withServerEnvironment(async (server) => {
        const commandEnvironment = { ...hosting, DATABASE_MAINTENANCE_URL: server.DATABASE_MAINTENANCE_URL };
        const privateValues = [server.DATABASE_MAINTENANCE_URL, ...listMaterials(keyrings)];

        const first = await runEnrollmentCommand(commandEnvironment);
        expect(first).toMatchObject({ exitCode: 0, stderr: "" });
        expect(JSON.parse(first.stdout)).toEqual({
          operation: "messaging_key_enrollment",
          state: "completed",
          purposes: MESSAGING_ENROLLED_MAC_KEY_PURPOSES.map((purpose) => ({ purpose, activeKeyId: keyrings[purpose].activeKeyId, keyIds: [keyrings[purpose].activeKeyId], newlyEnrolledKeyIds: [keyrings[purpose].activeKeyId] })),
        });
        for (const value of privateValues) expect(first.stdout).not.toContain(value);
        const enrolled = await snapshot();
        expect(enrolled).toHaveLength(before.length + MESSAGING_ENROLLED_MAC_KEY_PURPOSES.length);
        await expect(attest()).resolves.toBeUndefined();

        const second = await runEnrollmentCommand(commandEnvironment);
        expect(second.exitCode).toBe(0);
        expect(JSON.parse(second.stdout).purposes.map((report: { newlyEnrolledKeyIds: string[] }) => report.newlyEnrolledKeyIds)).toEqual(MESSAGING_ENROLLED_MAC_KEY_PURPOSES.map(() => []));
        expect(await snapshot()).toEqual(enrolled);

        const replacedKeyrings = { ...keyrings, [MESSAGING_KEY_PURPOSE.contactFingerprint]: { ...keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint], keys: keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint].keys.map((key) => ({ ...key, materialBase64: randomBytes(MESSAGING_CRYPTO.keyBytes).toString("base64") })) } };
        const replaced = await runEnrollmentCommand({ ...createHostingEnvironment(replacedKeyrings, securityEpoch), DATABASE_MAINTENANCE_URL: server.DATABASE_MAINTENANCE_URL });
        expect(replaced).toMatchObject({ exitCode: 1, stdout: "" });
        expect(JSON.parse(replaced.stderr)).toEqual({ operation: "messaging_key_enrollment", code: MESSAGING_CRYPTO_ERROR.keyContinuityUnproven });
        for (const value of [...privateValues, ...listMaterials(replacedKeyrings)]) expect(replaced.stderr).not.toContain(value);
        expect(await snapshot()).toEqual(enrolled);
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
