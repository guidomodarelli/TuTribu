/** Resolves current leader authority and normalizes explicit allowlist proposals without reserving contacts. @module manage-allowlist-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AllowlistReader, AllowlistCommandWriter, AllowlistQuery } from "../../domain/repositories/allowlist-management";
import type { AllowlistEntryPatch } from "../../domain/entities/allowlist-entry";
import { normalizeAdmissionContact, type AdmissionContactType } from "../../domain/value-objects/admission-contact";
import { normalizeAllowlistDisplayName } from "../../domain/value-objects/allowlist-display-name";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { admissionFailure } from "../results/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { allowlistPageSchema, presentAllowlistEntry } from "../results/allowlist-query-schemas";

type AllowlistScope = { tribeId: string; requestId: string };
type ConfirmedAllowlistScope = AllowlistScope & { operationId: string; confirmed: true };

/** Reads require current leadership; writes also require the exact signed global operation/resource. */
export class ManageAllowlistUseCases {
  /** @param resolver - Real current account, role, resource and signed recency owner. @param reader - Read-only own list storage. @param writer - Atomic original-ledger, selected-type and CAS owner. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AllowlistReader, private readonly writer: AllowlistCommandWriter) {}

  /** @param query - Authorized tenant and boundary-validated filters. @returns Current entries for the leader without recency demand or mutation. */
  async list(query: AllowlistScope & AllowlistQuery) {
    try {
      const authority = await this.resolver.execute({ tribeId: query.tribeId, requestId: query.requestId, action: ADMISSION_ACTION.manageAllowlist });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const filters: AllowlistQuery = { limit: query.limit, ...(query.search !== undefined ? { search: query.search } : {}), ...(query.status !== undefined ? { status: query.status } : {}), ...(query.cursor !== undefined ? { cursor: query.cursor } : {}) };
      const page = await this.reader.list(authority.context, filters);
      return { ok: true as const, value: allowlistPageSchema.parse({ items: page.entries.map(presentAllowlistEntry), nextCursor: page.nextCursor }) };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param query - Exact boundary-validated entry id in its tribe. @returns Current own metadata or a closed absence for an authorized leader. */
  async read(query: AllowlistScope & { entryId: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: query.tribeId, requestId: query.requestId, action: ADMISSION_ACTION.manageAllowlist, resource: { kind: ADMISSION_RESOURCE_KIND.allowlistEntry, id: query.entryId } });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const entry = await this.reader.read(authority.context, query.entryId);
      return { ok: true as const, value: entry ? presentAllowlistEntry(entry) : null };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Explicit contact/name proposal without browser identity, version or source. @returns Original creation result after canonicalization and scoped global recency, without binding any account. */
  async create(input: ConfirmedAllowlistScope & { contactType: AdmissionContactType; identity: string; country?: string; displayName?: string | null }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageAllowlist, sensitiveOperation: REAUTHENTICATION_OPERATION.createAllowlistEntry });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const normalized = normalizeAdmissionContact({ type: input.contactType, value: input.identity, country: input.country });
      const displayName = normalizeAllowlistDisplayName(input.displayName);
      if (!input.confirmed || normalized.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      return { ok: true as const, value: await this.writer.create({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, contact: normalized.contact, displayName }) };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Exact existing entry and explicit name/state edit with its observed version. @returns Original update result; the writer resolves replay before CAS and never changes identity or membership. */
  async update(input: ConfirmedAllowlistScope & { entryId: string; expectedVersion: number; patch: AllowlistEntryPatch }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageAllowlist, resource: { kind: ADMISSION_RESOURCE_KIND.allowlistEntry, id: input.entryId }, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAllowlistEntry });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const displayName = input.patch.displayName === undefined ? undefined : normalizeAllowlistDisplayName(input.patch.displayName);
      if (!input.confirmed || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0 || input.patch.displayName === undefined && input.patch.status === undefined) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      return { ok: true as const, value: await this.writer.update({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, entryId: input.entryId, expectedVersion: input.expectedVersion, patch: { ...(displayName !== undefined ? { displayName } : {}), ...(input.patch.status !== undefined ? { status: input.patch.status } : {}) } }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
