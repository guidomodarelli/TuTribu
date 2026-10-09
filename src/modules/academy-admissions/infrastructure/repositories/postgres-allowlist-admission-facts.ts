/** Projects private exact matching and current native evidence only inside the guarded admission transaction. @module postgres-allowlist-admission-facts */
import "server-only";
import { sql } from "drizzle-orm";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionContact } from "../../domain/value-objects/admission-contact";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";

/** @param database - Original guarded submission transaction. @param scope - Actual session/account and fixed tribe. @param contact - Own canonical proposed contact. @returns Private current native account, base capture and exact list/binding facts, never a public lookup DTO. */
export async function readAllowlistAdmissionFacts(database: RequestDatabase, scope: AdmissionCommandScope, contact: AdmissionContact | null) {
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: scope.userId, sessionId: scope.sessionId }), (_identity, run) => run(database));
  let account = await accounts.getAuthenticatedAccount();
  if (!account) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  if (account.googleAccount) await database.execute(sql`select id from public.account where id=${account.googleAccount.id} and "userId"=${scope.userId} for share`);
  if (account.identityEvidence) await database.execute(sql`select id from public.global_identity_evidence where id=${account.identityEvidence.id} and user_id=${scope.userId} for share`);
  account = await accounts.getAuthenticatedAccount();
  if (!account) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  const capture = account.identityEvidence;
  const baseEvidence = capture ? { id: capture.id, verifiedAt: capture.verifiedAt, userId: capture.userId, accountId: capture.accountId, subject: capture.subject, normalizedEmail: capture.normalizedEmail, authority: capture.classification, invalidated: capture.invalidatedAt !== null } : null;
  if (!contact) return { account: { userId: account.userId, normalizedEmail: account.normalizedEmail, googleAccount: account.googleAccount }, baseEvidence, allowlistEntry: null, contactBinding: null };
  const binding = (await database.execute<{ owner_user_id: string }>(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${scope.tribeId} and contact_type=${contact.type} and normalized_contact=${contact.value}`)).rows[0];
  const entry = (await database.execute<{ id: string; version: number; status: string }>(sql`select id,version,status from public.academy_allowlist_entries where tribe_id=${scope.tribeId} and contact_type=${contact.type} and normalized_contact=${contact.value} for share`)).rows[0];
  return { account: { userId: account.userId, normalizedEmail: account.normalizedEmail, googleAccount: account.googleAccount }, baseEvidence,
    allowlistEntry: entry ? { id: entry.id, version: entry.version, tribeId: scope.tribeId, contact, enabled: entry.status === ALLOWLIST_ENTRY_STATUS.enabled, boundUserId: binding?.owner_user_id ?? null } : null,
    contactBinding: binding ? { ownerUserId: binding.owner_user_id, contact } : null };
}
