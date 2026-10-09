/** Orchestrates current leader scope and explicit import input without owning transport or SQL. @module import-allowlist-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AllowlistImportInputReader, AllowlistImportRepository } from "../../domain/repositories/allowlist-import-repository";
import type { AdmissionContactType } from "../../domain/value-objects/admission-contact";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { presentAllowlistImport } from "../results/allowlist-import-result";

type ImportScope = { tribeId: string; requestId: string };
/** Keeps every mutation behind exact signed purpose and current scoped SQL owner. */
export class ImportAllowlistUseCases {
  /** @param resolver - Native leader/resource/recency authorization. @param repository - Real original operation and import row owner. @param inputReader - Once-validated file grammar adapter. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly repository: AllowlistImportRepository, private readonly inputReader: AllowlistImportInputReader) {}
  /** @param input - Explicit preview proposal without actor or permission. @returns Original private preview reference; file input creates no list effects. */
  async preview(input: ImportScope & { operationId: string; confirmed: true; expectedPolicyVersion: number; contactType: AdmissionContactType; csvText: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageAllowlist, sensitiveOperation: REAUTHENTICATION_OPERATION.previewAllowlistImport });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      if (!input.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const rows = this.inputReader.parse(input.csvText);
      return { ok: true as const, value: await this.repository.preview({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, expectedPolicyVersion: input.expectedPolicyVersion, contactType: input.contactType, csvText: input.csvText, rows }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
  /** @param input - Exact current import within its tribe. @returns Current own DTO without fingerprint/binding data, or closed absence. */
  async read(input: ImportScope & { importId: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageAllowlist, resource: { kind: ADMISSION_RESOURCE_KIND.allowlistImport, id: input.importId } });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const preview = await this.repository.read(authority.context, input.importId);
      return { ok: true as const, value: preview ? presentAllowlistImport(preview) : null };
    } catch (error) { return admissionOperationFailure(error); }
  }
  /** @param input - Explicit selected pending records and observed version. @returns Original confirmed result or actual unresolved progress without manufacturing success. */
  async confirm(input: ImportScope & { importId: string; operationId: string; confirmed: true; expectedVersion: number; selectedRows: readonly number[] }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageAllowlist, resource: { kind: ADMISSION_RESOURCE_KIND.allowlistImport, id: input.importId }, sensitiveOperation: REAUTHENTICATION_OPERATION.confirmAllowlistImport });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      if (!input.confirmed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      return { ok: true as const, value: await this.repository.confirm({ context: authority.context, importId: input.importId, operationId: input.operationId, confirmed: input.confirmed, expectedVersion: input.expectedVersion, selectedRows: input.selectedRows }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
