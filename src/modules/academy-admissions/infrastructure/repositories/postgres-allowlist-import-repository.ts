/** Owns temporary preview and original bounded confirmation without membership or binding side effects. @module postgres-allowlist-import-repository */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AllowlistImportRepository, AllowlistImportReference, AllowlistImportConfirmationResult } from "../../domain/repositories/allowlist-import-repository";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "../../domain/entities/admission-operation";
import { createAllowlistImport, selectAllowlistImportRows } from "../../domain/entities/allowlist-import";
import { createAllowlistEntry } from "../../domain/entities/allowlist-entry";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ALLOWLIST_IMPORT_DENIAL, ALLOWLIST_IMPORT_EFFECT_SQL, ALLOWLIST_IMPORT_BLOCK_SIZE, ALLOWLIST_IMPORT_STEP_OVERHEAD } from "../../constants/allowlist-import";
import { ADMISSION_IMPORT_PUBLIC_STATE, ADMISSION_IMPORT_ROW_OUTCOME } from "../../constants/admission-management-contract";
import { ALLOWLIST_ENTRY_STATUS, ALLOWLIST_ENTRY_SOURCE } from "../../constants/admission-resources";
import { ALLOWLIST_DATABASE_ORIGIN } from "../../constants/allowlist-management";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { createAdmissionOperationFingerprint } from "../verification/admission-operation-fingerprint";
import { authorizeAdmissionLeader, admissionDatabaseNow } from "./postgres-admission-leader-authorizer";
import { allowlistImportPreviewSnapshotSchema, allowlistImportDenialSchema, allowlistImportConfirmationSnapshotSchema } from "../../application/results/allowlist-import-operation-schemas";
import { createAdmissionContactFingerprint } from "../verification/admission-contact-fingerprint";
import type { AllowlistEntryRow } from "./allowlist-entry-row-mapper";
import { mapAllowlistImport, type AllowlistImportRecord, type AllowlistImportStoredRow, type AllowlistImportValidation, type AllowlistImportObservedEntry } from "./allowlist-import-row-mapper";

type ContextExecutor = <Result>(context: AuthorizedAdmissionContext, work: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Uses the existing backend owner connection and current native actor on every checkout. */
export class PostgresAllowlistImportRepository implements AllowlistImportRepository {
  /** @param execute - Existing guarded owner executor. @param readSecurityConfig - Explicit private hosting keys/recovery epoch, never provider IO. */
  constructor(private readonly execute: ContextExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}
  /** @param database - Current original transaction. @param context - Native current leader. @returns Selected policy under stable academy locks. */
  private async policy(database: RequestDatabase, context: AuthorizedAdmissionContext) {
    const settings = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${context.tribeId} for share`)).rows[0];
    if (settings?.access_model !== TRIBE_ACCESS_MODEL.academy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const policy = (await database.execute<{ version: number; contact_type: "email" | "phone" }>(sql`select version,contact_type from public.academy_admission_policies where tribe_id=${context.tribeId} for share`)).rows[0];
    if (!policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    return policy;
  }
  /** @param database - Authorized transaction. @param context - Current actor/tenant. @param importId - Exact own preview. @param writing - Lock intent selected by server operation. @returns Current private record or closed absence after expiry/legacy context. */
  private async record(database: RequestDatabase, context: AuthorizedAdmissionContext, importId: string, writing = false) {
    const record = (await database.execute<AllowlistImportRecord>(sql`select * from public.academy_allowlist_imports where id=${importId} and tribe_id=${context.tribeId} and actor_user_id=${context.userId} ${writing ? sql`for update` : sql`for share`}`)).rows[0];
    if (!record || !record.security_environment || !record.security_epoch || new Date(record.expires_at) <= await admissionDatabaseNow(database)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    return record;
  }
  /** @param database - Authorized transaction. @param importId - Existing own record. @param tribeId - Native tenant. @returns Original ordered private rows without DTO/schema row validation. */
  private async rows(database: RequestDatabase, importId: string, tribeId: string) {
    return (await database.execute<AllowlistImportStoredRow>(sql`select * from public.academy_allowlist_import_rows where import_id=${importId} and tribe_id=${tribeId} order by row_number`)).rows;
  }
  /** @param database - Original guarded transaction. @param work - DB-only preview/block callback. @returns Known denial after rolling back effect staging, or the actual result. */
  private async knownEffect<Value>(database: RequestDatabase, work: () => Promise<Value>) {
    await database.execute(sql.raw(ALLOWLIST_IMPORT_EFFECT_SQL.begin));
    let value: Value | z.infer<typeof allowlistImportDenialSchema>;
    try { value = await work(); }
    catch (error) {
      const denial = error instanceof AdmissionOperationError ? allowlistImportDenialSchema.safeParse({ outcome: ALLOWLIST_IMPORT_DENIAL, code: error.code }) : null;
      if (!denial?.success) throw error;
      await database.execute(sql.raw(ALLOWLIST_IMPORT_EFFECT_SQL.rollback)); value = denial.data;
    }
    await database.execute(sql.raw(ALLOWLIST_IMPORT_EFFECT_SQL.release));
    return value;
  }
  /** @param context - Current native leader. @param operation - Exact signed sensitive purpose. @param resourceId - Tribe or own import. @returns Original operation owner with final transaction-bound checks. */
  private ledger(context: AuthorizedAdmissionContext, operation: typeof REAUTHENTICATION_OPERATION.previewAllowlistImport | typeof REAUTHENTICATION_OPERATION.confirmAllowlistImport, resourceId: string) {
    return new PostgresAdmissionOperationRepository((work) => this.execute(context, work), async (database) => { await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageAllowlist, resourceId, operation }); return true; }, this.readSecurityConfig);
  }
  /** @param input - Explicit bounded parsed file, native scope and exact policy version. @returns Original preview reference, without creating or editing list entries. */
  async preview(input: Parameters<AllowlistImportRepository["preview"]>[0]): Promise<AdmissionOperationResult<AllowlistImportReference>> {
    if (!input.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const operation = REAUTHENTICATION_OPERATION.previewAllowlistImport;
    const command: AdmissionOperationCommand = { actorUserId: input.context.userId, tribeId: input.context.tribeId, operationType: operation, idempotencyKey: input.operationId, intent: { confirmed: true, expectedPolicyVersion: input.expectedPolicyVersion, contactType: input.contactType, csvText: input.csvText } };
    const ledger = this.ledger(input.context, operation, input.context.tribeId);
    let original;
    try { original = await ledger.run(command, allowlistImportPreviewSnapshotSchema, (database) => this.knownEffect(database, async () => {
      const policy = await this.policy(database, input.context);
      if (policy.version !== input.expectedPolicyVersion || policy.contact_type !== input.contactType) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      const config = await this.readSecurityConfig(), fingerprint = await createAdmissionOperationFingerprint(config).sign(command), now = await admissionDatabaseNow(database);
      const preview = createAllowlistImport({ id: randomUUID(), tribeId: input.context.tribeId, actorUserId: input.context.userId, policyVersion: policy.version, contactType: policy.contact_type, fileFingerprint: fingerprint.digest, fingerprintKeyId: fingerprint.keyId, now, rows: input.rows });
      const contacts = preview.rows.flatMap((row) => row.contact ? [row.contact.value] : []);
      const existing = contacts.length ? (await database.execute<{ normalized_contact: string; id: string; version: number; status: string; display_name: string | null }>(sql`select normalized_contact,id,version,status,display_name from public.academy_allowlist_entries where tribe_id=${preview.tribeId} and contact_type=${preview.contactType} and normalized_contact in (${sql.join(contacts.map((contact) => sql`${contact}`), sql`,`)})`)).rows : [];
      const observed = new Map<string, AllowlistImportObservedEntry>(existing.map((entry) => [entry.normalized_contact, { id: entry.id, version: entry.version, status: entry.status, displayName: entry.display_name }]));
      await database.execute(sql`insert into public.academy_allowlist_imports(id,tribe_id,actor_user_id,contact_type,policy_version,file_fingerprint,fingerprint_key_id,security_environment,security_epoch,created_at,expires_at,purge_after) values (${preview.id},${preview.tribeId},${preview.actorUserId},${preview.contactType},${preview.policyVersion},${Buffer.from(preview.fileFingerprint)},${preview.fingerprintKeyId},${config.environment},${config.securityEpoch},${now},${preview.expiresAt},${preview.purgeAfter})`);
      if (preview.rows.length) {
        const values = preview.rows.map((row) => { const validation: AllowlistImportValidation = { contact: row.contact, displayName: row.displayName, errors: row.errors, duplicateOf: row.duplicateOf, observedEntry: row.contact ? observed.get(row.contact.value) ?? null : null }; return sql`(${preview.id},${preview.tribeId},${row.rowNumber},${JSON.stringify(row.input)}::jsonb,${JSON.stringify(validation)}::jsonb)`; });
        await database.execute(sql`insert into public.academy_allowlist_import_rows(import_id,tribe_id,row_number,input_data,validation_result) values ${sql.join(values, sql`,`)}`);
      }
      const current = await this.readSecurityConfig();
      if (current.recoveryLocked || current.environment !== config.environment || current.securityEpoch !== config.securityEpoch) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return { importId: preview.id, sourceVersion: preview.version, expiresAt: preview.expiresAt.toISOString() };
    })); } catch (error) {
      if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.operationUnresolved) throw error;
      const recovered = await ledger.read(command, allowlistImportPreviewSnapshotSchema);
      if (recovered?.state !== OPERATION_STATE.completed) throw error;
      original = recovered;
    }
    if (original.state === OPERATION_STATE.started) return original;
    if ("outcome" in original.result) throw new AdmissionOperationError(original.result.code, { operationId: original.operationId, operationState: OPERATION_STATE.completed });
    return { ...original, result: original.result };
  }
  /** @param context - Current leader of the native tenant. @param importId - Own exact preview. @returns Authorized original rows/current progress without requiring write recency. */
  async read(context: AuthorizedAdmissionContext, importId: string) {
    return this.execute(context, async (database) => {
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageAllowlist, resourceId: importId });
      await this.policy(database, context);
      const record = await this.record(database, context, importId), rows = await this.rows(database, importId, context.tribeId);
      await authorizeAdmissionLeader(database, context, { action: ADMISSION_ACTION.manageAllowlist, resourceId: importId });
      if (new Date(record.expires_at) <= await admissionDatabaseNow(database)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return mapAllowlistImport(record, rows);
    });
  }
  /** @param input - Explicit selected pending rows and current scope. @returns Original bounded confirmation progress/result. */
  async confirm(input: Parameters<AllowlistImportRepository["confirm"]>[0]): Promise<AdmissionOperationResult<AllowlistImportConfirmationResult>> {
    if (!input.confirmed || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0 || input.selectedRows.length === 0 || input.selectedRows.length > ADMISSION_LIMIT.csvDataRowCount || new Set(input.selectedRows).size !== input.selectedRows.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const selectedRows = [...input.selectedRows].sort((first, second) => first - second), operation = REAUTHENTICATION_OPERATION.confirmAllowlistImport;
    const command: AdmissionOperationCommand = { actorUserId: input.context.userId, tribeId: input.context.tribeId, operationType: operation, idempotencyKey: input.operationId, intent: { confirmed: true, importId: input.importId, expectedVersion: input.expectedVersion, selectedRows } };
    const ledger = this.ledger(input.context, operation, input.importId);
    const maximumSteps = Math.ceil(selectedRows.length / ALLOWLIST_IMPORT_BLOCK_SIZE) + ALLOWLIST_IMPORT_STEP_OVERHEAD;
    const original = await ledger.runChunks(command, allowlistImportConfirmationSnapshotSchema, maximumSteps, async (database, ledgerId) => {
      const effect = await this.knownEffect(database, () => this.confirmStep(database, ledgerId, input, selectedRows));
      return "outcome" in effect ? { completed: true, result: effect } : effect;
    });
    if (original.state === OPERATION_STATE.started) return original;
    if ("outcome" in original.result) throw new AdmissionOperationError(original.result.code, { operationId: original.operationId, operationState: OPERATION_STATE.completed });
    return { ...original, result: original.result };
  }
  /** @param database - One original transaction. @param ledgerId - Actual current claim. @param input - Immutable public command/native actor. @param selectedRows - Stable explicit row ids. @returns One bounded block or the immutable final public snapshot. */
  private async confirmStep(database: RequestDatabase, ledgerId: string, input: Parameters<AllowlistImportRepository["confirm"]>[0], selectedRows: number[]): Promise<{ completed: false } | { completed: true; result: AllowlistImportConfirmationResult }> {
    const policy = await this.policy(database, input.context), record = await this.record(database, input.context, input.importId, true);
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked || config.environment !== record.security_environment || config.securityEpoch !== record.security_epoch || !config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(record.fingerprint_key_id)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    if (policy.version !== record.policy_version || policy.contact_type !== record.contact_type) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    if (record.active_operation_id !== ledgerId) {
      const accepted = (await database.execute(sql`select operation_id from public.academy_allowlist_import_selections where operation_id=${ledgerId} and import_id=${record.id} and tribe_id=${record.tribe_id} and actor_user_id=${record.actor_user_id}`)).rows[0];
      if (record.active_operation_id) {
        const active = (await database.execute<{ state: string; lease_until: Date | string | null }>(sql`select state,lease_until from public.academy_admission_operations where id=${record.active_operation_id} and actor_user_id=${input.context.userId} and tribe_id=${input.context.tribeId} for update`)).rows[0];
        if (active?.state === OPERATION_STATE.started && active.lease_until && new Date(active.lease_until) > await admissionDatabaseNow(database)) throw new AdmissionOperationError(accepted ? ADMISSION_ERROR_CODE.operationUnresolved : ADMISSION_ERROR_CODE.allowlistImportConflict);
      }
      if (accepted) {
        const remaining = (await database.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id} and row_number in (${sql.join(selectedRows.map((rowNumber) => sql`${rowNumber}`), sql`,`)}) and outcome is null`)).rows[0].count;
        if (remaining > 0) {
          await database.execute(sql`update public.academy_allowlist_imports set active_operation_id=${ledgerId} where id=${record.id}`);
          return { completed: false };
        }
        return { completed: true, result: await this.confirmationResult(database, record) };
      }
      const rows = await this.rows(database, input.importId, input.context.tribeId), snapshot = mapAllowlistImport(record, rows), now = await admissionDatabaseNow(database);
      const selected = selectAllowlistImportRows({ preview: snapshot, expectedVersion: input.expectedVersion, selectedRows, confirmed: true, context: { actorUserId: input.context.userId, tribeId: input.context.tribeId, policyVersion: policy.version, contactType: policy.contact_type, now } });
      const allSelected = selected.rows.filter((row) => row.selected).map((row) => row.rowNumber);
      const updated = (await database.execute(sql`update public.academy_allowlist_imports set state=${selected.state},selected_rows=array[${sql.join(allSelected.map((rowNumber) => sql`${rowNumber}`), sql`,`)}]::integer[],version=${selected.version},active_operation_id=${ledgerId} where id=${record.id} and version=${record.version} returning id`)).rows[0];
      if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.allowlistImportConflict);
      await database.execute(sql`insert into public.academy_allowlist_import_selections(operation_id,import_id,tribe_id,actor_user_id,expected_version,selected_rows,accepted_at) values (${ledgerId},${record.id},${record.tribe_id},${record.actor_user_id},${input.expectedVersion},array[${sql.join(selectedRows.map((rowNumber) => sql`${rowNumber}`), sql`,`)}]::integer[],${now})`);
      return { completed: false };
    }
    const pending = (await database.execute<AllowlistImportStoredRow>(sql`select * from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id} and row_number in (${sql.join(selectedRows.map((rowNumber) => sql`${rowNumber}`), sql`,`)}) and outcome is null order by row_number limit ${ALLOWLIST_IMPORT_BLOCK_SIZE} for update`)).rows;
    if (pending.length) {
      for (const row of pending) await this.confirmRow(database, ledgerId, record, row, config, input.context);
      const currentConfig = await this.readSecurityConfig();
      if (currentConfig.recoveryLocked || currentConfig.environment !== config.environment || currentConfig.securityEpoch !== config.securityEpoch || !currentConfig.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint].keys.has(config.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint].activeKeyId)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (new Date(record.expires_at) <= await admissionDatabaseNow(database)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const completed = (await database.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id} and outcome is not null`)).rows[0].count;
      await database.execute(sql`update public.academy_allowlist_imports set completed_rows=${completed},version=version+1 where id=${record.id} and version=${record.version}`);
      return { completed: false };
    }
    const remaining = (await database.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id} and row_number in (${sql.join(record.selected_rows.map((rowNumber) => sql`${rowNumber}`), sql`,`)}) and outcome is null`)).rows[0].count;
    if (remaining === 0 && record.state !== ADMISSION_IMPORT_PUBLIC_STATE.completed) {
      await database.execute(sql`update public.academy_allowlist_import_rows set outcome=${ADMISSION_IMPORT_ROW_OUTCOME.skipped},confirmed_operation_id=${ledgerId},committed_at=clock_timestamp() where import_id=${record.id} and tribe_id=${record.tribe_id} and outcome is null and row_number not in (${sql.join(record.selected_rows.map((rowNumber) => sql`${rowNumber}`), sql`,`)})`);
      if (new Date(record.expires_at) <= await admissionDatabaseNow(database)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const finalConfig = await this.readSecurityConfig();
      if (finalConfig.recoveryLocked || finalConfig.environment !== record.security_environment || finalConfig.securityEpoch !== record.security_epoch || !finalConfig.keyrings[MESSAGING_KEY_PURPOSE.operationPayload].keys.has(record.fingerprint_key_id)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const completed = (await database.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id} and outcome is not null`)).rows[0].count;
      await database.execute(sql`update public.academy_allowlist_imports set state=${ADMISSION_IMPORT_PUBLIC_STATE.completed},completed_rows=${completed},version=version+1 where id=${record.id} and version=${record.version}`);
      return { completed: true, result: await this.confirmationResult(database, { ...record, version: record.version + 1, completed_rows: completed, state: ADMISSION_IMPORT_PUBLIC_STATE.completed }) };
    }
    return { completed: true, result: await this.confirmationResult(database, record) };
  }
  /** @param database - Current transaction. @param record - Actual own progress. @returns Aggregate original outcome counts, never unconfirmed work. */
  private async confirmationResult(database: RequestDatabase, record: AllowlistImportRecord): Promise<AllowlistImportConfirmationResult> {
    const counts = (await database.execute<{ added: number; unchanged: number; skipped: number; conflict: number }>(sql`select count(*) filter(where outcome='added')::int as added,count(*) filter(where outcome='unchanged')::int as unchanged,count(*) filter(where outcome='skipped')::int as skipped,count(*) filter(where outcome='conflict')::int as conflict from public.academy_allowlist_import_rows where import_id=${record.id} and tribe_id=${record.tribe_id}`)).rows[0];
    return { importId: record.id, sourceVersion: record.version, state: record.state, counts: { selected: record.selected_rows.length, ...counts } };
  }
  /** @param database - Original block transaction. @param ledgerId - Parent original operation. @param record - Locked own import. @param row - Pending private row, never a provider DTO. @param config - Current protected key/epoch snapshot. @param context - Current native leader. @returns After an actual entry/no-op/conflict and its row outcome are staged together. */
  private async confirmRow(database: RequestDatabase, ledgerId: string, record: AllowlistImportRecord, row: AllowlistImportStoredRow, config: MessagingSecurityConfig, context: AuthorizedAdmissionContext): Promise<void> {
    const validation = row.validation_result, contact = validation.contact;
    if (validation.errors.length || !contact || !record.selected_rows.includes(row.row_number)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    const existing = (await database.execute<AllowlistEntryRow>(sql`select * from public.academy_allowlist_entries where tribe_id=${record.tribe_id} and contact_type=${record.contact_type} and normalized_contact=${contact.value} for update`)).rows[0];
    let outcome: "added" | "unchanged" | "conflict", entryId: string | null = null, entryVersion: number | null = null;
    const now = await admissionDatabaseNow(database);
    if (existing) {
      const stable = !validation.observedEntry || validation.observedEntry.id === existing.id && validation.observedEntry.version === existing.version;
      if (stable && existing.status === ALLOWLIST_ENTRY_STATUS.enabled && existing.display_name === validation.displayName) { outcome = ADMISSION_IMPORT_ROW_OUTCOME.unchanged; entryId = existing.id; entryVersion = existing.version; }
      else outcome = ADMISSION_IMPORT_ROW_OUTCOME.conflict;
    } else if (validation.observedEntry) outcome = ADMISSION_IMPORT_ROW_OUTCOME.conflict;
    else {
      const fingerprint = await createAdmissionContactFingerprint(contact, config);
      const entry = createAllowlistEntry({ id: randomUUID(), tribeId: record.tribe_id, actorUserId: context.userId, now, contact, displayName: validation.displayName, source: ALLOWLIST_ENTRY_SOURCE.csv, importId: record.id });
      await database.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,status,version,origin,import_id,created_by_user_id,updated_by_user_id,created_at,updated_at) values (${entry.id},${entry.tribeId},${entry.contact.type},${entry.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${entry.displayName},${entry.status},${entry.version},${ALLOWLIST_DATABASE_ORIGIN.csv},${record.id},${context.userId},${context.userId},${now},${now})`);
      await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,resource_version) values (${record.tribe_id},${context.userId},${ADMISSION_RESOURCE_KIND.allowlistEntry},${entry.id},${ledgerId},${REAUTHENTICATION_OPERATION.confirmAllowlistImport},1)`);
      outcome = ADMISSION_IMPORT_ROW_OUTCOME.added; entryId = entry.id; entryVersion = 1;
    }
    await database.execute(sql`update public.academy_allowlist_import_rows set outcome=${outcome},entry_id=${entryId},entry_version=${entryVersion},confirmed_operation_id=${ledgerId},committed_at=${now} where import_id=${record.id} and tribe_id=${record.tribe_id} and row_number=${row.row_number} and outcome is null`);
  }
}
