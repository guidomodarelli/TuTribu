/** Enrolls the hosting HMAC keyrings in the immutable proof inventory from a private owner connection. @module enroll-messaging-key-materials */
import "server-only";
import { sql } from "drizzle-orm";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { prepareRequestDatabaseContext, runWithGuardedTransaction, type RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingMacKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
import { MESSAGING_CRYPTO_ERROR } from "../../constants/messaging-cryptography";
import { MESSAGING_ENROLLED_MAC_KEY_PURPOSES, MESSAGING_KEY_ENROLLMENT, MESSAGING_KEY_ENROLLMENT_ERROR, type MessagingKeyEnrollmentErrorCode } from "../../constants/messaging-key-enrollment";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import { readMessagingHostingSecurityConfig } from "../config/messaging-hosting-security";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";
import { registerMessagingPrivateMacKeyMaterial } from "../repositories/assert-messaging-key-material";

type HostingEnvironment = Readonly<Record<string, string | undefined>>;

/** Safe per-purpose outcome: key ids are routing metadata, never material or verifiers. */
export type MessagingKeyEnrollmentPurposeReport = {
  purpose: MessagingMacKeyPurpose;
  activeKeyId: string;
  keyIds: string[];
  newlyEnrolledKeyIds: string[];
};

/** Closed command failure that carries no connection string, key material or SQL text. */
class MessagingKeyEnrollmentError extends Error {
  readonly code: MessagingKeyEnrollmentErrorCode;

  /** @param code - Stable operator diagnostic. @param options - Native cause, never printed by the command. */
  constructor(code: MessagingKeyEnrollmentErrorCode, options?: ErrorOptions) {
    super(`MessagingKeyEnrollment failed: ${code}`, options);
    this.name = "MessagingKeyEnrollmentError";
    this.code = code;
  }
}

/**
 * Registers every active and retained key id of the enrolled HMAC purposes, without ever replacing an existing proof.
 * @param database - Owner-only transaction with no application user in context.
 * @param config - Hosting keyrings read from the current deployment secrets.
 * @returns One report per purpose; a second run over the same keyrings reports no new ids.
 * @throws MessagingCryptographyError `messaging_crypto_context_mismatch` for a request role and `messaging_crypto_key_continuity_unproven` when an enrolled id now holds different material.
 */
export async function enrollMessagingKeyMaterials(database: RequestDatabase, config: MessagingSecurityConfig): Promise<MessagingKeyEnrollmentPurposeReport[]> {
  const allowed = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_table_privilege(current_user,'public.messaging_key_material_proofs','SELECT') and has_function_privilege(current_user,'public.assert_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
  if (!allowed) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
  const reports: MessagingKeyEnrollmentPurposeReport[] = [];
  for (const purpose of MESSAGING_ENROLLED_MAC_KEY_PURPOSES) {
    const enrolledBefore = new Set((await database.execute<{ key_id: string }>(sql`select key_id from public.messaging_key_material_proofs where purpose=${purpose}`)).rows.map((row) => row.key_id));
    await registerMessagingPrivateMacKeyMaterial(database, config, purpose);
    const keyIds = [...config.keyrings[purpose].keys.keys()].sort();
    reports.push({ purpose, activeKeyId: config.keyrings[purpose].activeKeyId, keyIds, newlyEnrolledKeyIds: keyIds.filter((keyId) => !enrolledBefore.has(keyId)) });
  }
  return reports;
}

/** @param environment - Operator environment. @returns The first configured private connection, never the request role. @throws MessagingKeyEnrollmentError when no private connection is configured. */
function readPrivateConnectionString(environment: HostingEnvironment): string {
  for (const key of MESSAGING_KEY_ENROLLMENT.connectionEnvironmentKeys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }
  throw new MessagingKeyEnrollmentError(MESSAGING_KEY_ENROLLMENT_ERROR.connectionMissing);
}

/**
 * Reads the hosting keyrings and enrolls them through one private transaction; the entrypoint of `pnpm messaging:enroll-keys`.
 * @param environment - Deployment secrets (`MESSAGING_*`) and a private connection (`DATABASE_MAINTENANCE_URL` or `DATABASE_MIGRATION_URL`).
 * @returns Per-purpose report after the transaction commits.
 * @throws MessagingKeyEnrollmentError or MessagingCryptographyError with a stable code; any other failure is the native database error.
 */
export async function enrollHostingMessagingKeyMaterials(environment: HostingEnvironment): Promise<MessagingKeyEnrollmentPurposeReport[]> {
  const connectionString = readPrivateConnectionString(environment);
  const config = await readMessagingHostingSecurityConfig(environment);
  const pool = createPostgresPool({ connectionString, operation: MESSAGING_KEY_ENROLLMENT.poolOperation, maximumConnections: MESSAGING_KEY_ENROLLMENT.maximumConnections });
  try {
    return await runWithGuardedTransaction(pool, (database) => enrollMessagingKeyMaterials(database, config), (database) => prepareRequestDatabaseContext(database, { userId: null, email: null }));
  } finally {
    await pool.end();
  }
}

/** @param error - Any command failure. @returns Only a stable code and, for database errors, the SQLSTATE; never messages, URLs or causes. */
export function describeMessagingKeyEnrollmentFailure(error: unknown): { code: string; sqlState?: string } {
  if (error instanceof MessagingKeyEnrollmentError || error instanceof MessagingCryptographyError) return { code: error.code };
  const sqlState = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && MESSAGING_KEY_ENROLLMENT.sqlStatePattern.test(error.code) ? error.code : undefined;
  return { code: MESSAGING_KEY_ENROLLMENT_ERROR.unexpectedFailure, ...(sqlState ? { sqlState } : {}) };
}
