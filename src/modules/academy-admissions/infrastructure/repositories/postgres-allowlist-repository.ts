/** Commits leader-owned list configuration and its original outcome without binding contacts or granting membership. @module postgres-allowlist-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AllowlistCommandWriter, AllowlistCreationIntent, AllowlistUpdateIntent, AllowlistMutationResult } from "../../domain/repositories/allowlist-management";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "../../domain/entities/admission-operation";
import { createAllowlistEntry, proposeAllowlistEntryChange, type AllowlistEntry } from "../../domain/entities/allowlist-entry";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "../../domain/value-objects/allowlist-display-name";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ALLOWLIST_ENTRY_SOURCE, ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { ALLOWLIST_DATABASE_ORIGIN, ALLOWLIST_MUTATION_DENIAL, ALLOWLIST_EFFECT_SQL } from "../../constants/allowlist-management";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { allowlistMutationSnapshotSchema, allowlistMutationDenialSchema } from "../../application/results/allowlist-mutation-schemas";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { authorizeAdmissionLeader, admissionDatabaseNow } from "./postgres-admission-leader-authorizer";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";

type EntryRow = { id: string; tribe_id: string; contact_type: "email" | "phone"; normalized_contact: string; display_name: string | null; status: "enabled" | "disabled"; version: number; origin: "manual" | "import"; import_id: string | null; created_by_user_id: string | null; updated_by_user_id: string | null; created_at: Date | string; updated_at: Date | string };
type ListIntent = AllowlistCreationIntent | AllowlistUpdateIntent;
type MutationSnapshot = AllowlistMutationResult | { outcome: "denied"; code: "allowlist_conflict" | "invalid_input" | "resource_unavailable" };
type ContextExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Projects trusted stored columns into the canonical own entity; no row schema validation is added. @param row - Authorized scoped PostgreSQL row. @returns The immutable contact and editable configuration. @throws AdmissionOperationError when a stored phone cannot provide its canonical country. */
function entryFromRow(row: EntryRow): AllowlistEntry {
  const normalized = normalizeAdmissionContact({ type: row.contact_type, value: row.normalized_contact });
  if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  return { id: row.id, tribeId: row.tribe_id, contact: normalized.contact, displayName: row.display_name, status: row.status, version: row.version, source: row.origin === ALLOWLIST_DATABASE_ORIGIN.csv ? ALLOWLIST_ENTRY_SOURCE.csv : ALLOWLIST_ENTRY_SOURCE.manual, importId: row.import_id, createdByUserId: row.created_by_user_id, updatedByUserId: row.updated_by_user_id, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}

/** Every phase rechecks native authority; mutation, audit and original outcome commit together. */
export class PostgresAllowlistRepository implements AllowlistCommandWriter {
  /** @param execute - Guarded current-user executor with safe checkout/transaction cleanup. @param readSecurityConfig - Local independent keyring/epoch snapshot without provider HTTP. */
  constructor(private readonly execute: ContextExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param database - Original authorized transaction. @param context - Current leader scope. @returns The selected contact type after locking the academy/settings/policy. */
  private async selectedContactType(database: RequestDatabase, context: AuthorizedAdmissionContext) {
    const settings = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${context.tribeId} for share`)).rows[0];
    if (settings?.access_model !== TRIBE_ACCESS_MODEL.academy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const policy = (await database.execute<{ contact_type: "email" | "phone" }>(sql`select contact_type from public.academy_admission_policies where tribe_id=${context.tribeId} for share`)).rows[0];
    if (!policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    return policy.contact_type;
  }

  /** @param database - Original operation effect. @param context - Native actor/tenant. @param ledgerId - Actual original claim. @param operation - Server-selected command purpose. @param entry - Effectively changed configuration. @returns After its audit is staged without contact or owner payload. */
  private async audit(database: RequestDatabase, context: AuthorizedAdmissionContext, ledgerId: string, operation: ReauthenticationOperation, entry: AllowlistEntry) {
    await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,resource_version) values (${context.tribeId},${context.userId},${ADMISSION_RESOURCE_KIND.allowlistEntry},${entry.id},${ledgerId},${operation},${entry.version})`);
  }

  /** @param intent - Exact native proposal, without caller permissions. @param operation - Server-owned namespace/recency. @param resourceId - Tribe for creation or exact entry for editing. @param payload - Canonical intent protected by the ledger. @param mutate - DB-only list effect returning a grant or known denial. @returns Confirmed original result or actual progress; no stale CAS overrides a replay. */
  private async run(intent: ListIntent, operation: ReauthenticationOperation, resourceId: string, payload: AdmissionOperationCommand["intent"], mutate: (database: RequestDatabase, ledgerId: string) => Promise<MutationSnapshot>): Promise<AdmissionOperationResult<AllowlistMutationResult>> {
    const command = { actorUserId: intent.context.userId, tribeId: intent.context.tribeId, operationType: operation, idempotencyKey: intent.operationId, intent: payload };
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(intent.context, work), async (database) => { await authorizeAdmissionLeader(database, intent.context, { action: ADMISSION_ACTION.manageAllowlist, resourceId, operation }); return true; }, this.readSecurityConfig);
    let original;
    try { original = await ledger.run(command, allowlistMutationSnapshotSchema, async (database, ledgerId) => {
      await database.execute(sql.raw(ALLOWLIST_EFFECT_SQL.begin));
      let snapshot: MutationSnapshot;
      try { snapshot = await mutate(database, ledgerId); }
      catch (error) {
        const denial = error instanceof AdmissionOperationError ? allowlistMutationDenialSchema.safeParse({ outcome: ALLOWLIST_MUTATION_DENIAL, code: error.code }) : null;
        if (!denial?.success) throw error;
        snapshot = denial.data;
      }
      if ("outcome" in snapshot) await database.execute(sql.raw(ALLOWLIST_EFFECT_SQL.rollback));
      await database.execute(sql.raw(ALLOWLIST_EFFECT_SQL.release));
      return snapshot;
    }); }
    catch (error) {
      if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.operationUnresolved) throw error;
      try { original = await ledger.read(command, allowlistMutationSnapshotSchema); }
      catch (recoveryError) { if (recoveryError instanceof AdmissionOperationError) throw recoveryError; throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: intent.operationId, cause: new AggregateError([error, recoveryError], "Allowlist original commit recovery failed", { cause: error }) }); }
      if (original?.state !== OPERATION_STATE.completed) throw error;
    }
    if (original.state === OPERATION_STATE.started) return original;
    if ("outcome" in original.result) throw new AdmissionOperationError(original.result.code, { operationId: original.operationId, operationState: OPERATION_STATE.completed });
    return { ...original, result: original.result };
  }

  /** @param intent - Explicit canonical contact/name proposal. @returns Version-one creation, unchanged matching duplicate or completed conflict; never edits/reactivates an existing row. */
  async create(intent: AllowlistCreationIntent) {
    if (!intent.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const displayName = normalizeAllowlistDisplayName(intent.displayName);
    const normalized = normalizeAdmissionContact(intent.contact);
    if (normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const contact = normalized.contact;
    return this.run(intent, REAUTHENTICATION_OPERATION.createAllowlistEntry, intent.context.tribeId, { confirmed: true, contact, displayName }, async (database, ledgerId) => {
      if (await this.selectedContactType(database, intent.context) !== contact.type) return { outcome: ALLOWLIST_MUTATION_DENIAL, code: ADMISSION_ERROR_CODE.invalidInput };
      const existing = (await database.execute<EntryRow>(sql`select * from public.academy_allowlist_entries where tribe_id=${intent.context.tribeId} and contact_type=${contact.type} and normalized_contact=${contact.value} for update`)).rows[0];
      if (existing) return existing.status === ALLOWLIST_ENTRY_STATUS.enabled && existing.display_name === displayName ? { entryId: existing.id, version: existing.version, changed: false, created: false } : { outcome: ALLOWLIST_MUTATION_DENIAL, code: ADMISSION_ERROR_CODE.allowlistConflict };
      const config = await this.readSecurityConfig(), fingerprint = await createAdmissionContactFingerprint(contact, config), now = await admissionDatabaseNow(database);
      const entry = createAllowlistEntry({ id: randomUUID(), tribeId: intent.context.tribeId, actorUserId: intent.context.userId, now, contact, displayName, source: ALLOWLIST_ENTRY_SOURCE.manual });
      await database.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,status,version,origin,created_by_user_id,updated_by_user_id,created_at,updated_at) values (${entry.id},${entry.tribeId},${entry.contact.type},${entry.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${entry.displayName},${entry.status},${entry.version},${ALLOWLIST_DATABASE_ORIGIN.manual},${entry.createdByUserId},${entry.updatedByUserId},${now},${now})`);
      await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.createAllowlistEntry, entry);
      const current = await this.readSecurityConfig();
      if (current.recoveryLocked || current.environment !== config.environment || current.securityEpoch !== config.securityEpoch || !current.keyrings.contact_fingerprint.keys.has(fingerprint.keyId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return { entryId: entry.id, version: entry.version, changed: true, created: true };
    });
  }

  /** @param intent - Explicit name/state update on the observed entry version. @returns Exactly one effective increment, current no-op or completed stale denial without membership/binding writes. */
  async update(intent: AllowlistUpdateIntent) {
    if (!intent.confirmed || !Number.isInteger(intent.expectedVersion) || intent.expectedVersion <= 0 || intent.patch.displayName === undefined && intent.patch.status === undefined) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const patch = { ...(intent.patch.displayName !== undefined ? { displayName: normalizeAllowlistDisplayName(intent.patch.displayName) } : {}), ...(intent.patch.status !== undefined ? { status: intent.patch.status } : {}) };
    return this.run(intent, REAUTHENTICATION_OPERATION.updateAllowlistEntry, intent.entryId, { confirmed: true, entryId: intent.entryId, expectedVersion: intent.expectedVersion, patch }, async (database, ledgerId) => {
      const selectedType = await this.selectedContactType(database, intent.context);
      const row = (await database.execute<EntryRow>(sql`select * from public.academy_allowlist_entries where tribe_id=${intent.context.tribeId} and id=${intent.entryId} for update`)).rows[0];
      if (!row) return { outcome: ALLOWLIST_MUTATION_DENIAL, code: ADMISSION_ERROR_CODE.resourceUnavailable };
      if (row.contact_type !== selectedType) return { outcome: ALLOWLIST_MUTATION_DENIAL, code: ADMISSION_ERROR_CODE.invalidInput };
      const proposal = proposeAllowlistEntryChange({ entry: entryFromRow(row), expectedVersion: intent.expectedVersion, patch, actorUserId: intent.context.userId, now: await admissionDatabaseNow(database) });
      if (!proposal.ok) return { outcome: ALLOWLIST_MUTATION_DENIAL, code: proposal.code };
      if (!proposal.changed) return { entryId: row.id, version: row.version, changed: false, created: false };
      const entry = proposal.entry;
      const saved = (await database.execute(sql`update public.academy_allowlist_entries set display_name=${entry.displayName},status=${entry.status},version=${entry.version},updated_by_user_id=${entry.updatedByUserId},updated_at=${entry.updatedAt} where tribe_id=${entry.tribeId} and id=${entry.id} and version=${intent.expectedVersion} returning id`)).rows[0];
      if (!saved) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.allowlistConflict);
      await this.audit(database, intent.context, ledgerId, REAUTHENTICATION_OPERATION.updateAllowlistEntry, entry);
      return { entryId: entry.id, version: entry.version, changed: true, created: false };
    });
  }
}
