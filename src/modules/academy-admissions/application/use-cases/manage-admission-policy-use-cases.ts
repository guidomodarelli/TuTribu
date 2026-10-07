/** Resolves actual authority before explicit policy commands, without provider or persistence imports. @module manage-admission-policy-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionPolicyCommandWriter, AdmissionPolicyStateReader } from "../../domain/repositories/admission-policy-management";
import type { AdmissionPolicyPatch } from "../../domain/entities/admission-policy";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_POLICY_OPERATION } from "../../constants/admission-policy";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

type PolicyQuery = { tribeId: string; requestId: string };
type PolicyConfirmation = PolicyQuery & { operationId: string; confirmed: true };
type VersionedPolicyConfirmation = PolicyConfirmation & { expectedVersion: number };

/** Current scope and private signed recency are derived by the resolver, never the browser. */
export class ManageAdmissionPolicyUseCases {
  /** @param resolver - Current account/role/resource and signed recency owner. @param reader - Read-only own policy state. @param writer - Atomic current-preparation/ledger/CAS authority. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AdmissionPolicyStateReader, private readonly writer: AdmissionPolicyCommandWriter) {}

  /** @param query - Exact authorized tribe and correlation. @returns Current policy or real absence for a current leader, without any creation or recency demand. */
  async read(query: PolicyQuery) {
    try {
      const authority = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      return authority.allowed ? { ok: true as const, value: await this.reader.read(authority.context) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Explicit first creation, with no caller-chosen version/defaults. @returns Original initialization; the writer preserves an existing resource rather than recreating it. */
  async initialize(input: PolicyConfirmation) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy });
      return authority.allowed ? { ok: true as const, value: await this.writer.initialize({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, type: ADMISSION_POLICY_OPERATION.initialize }) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Original explicit settings intent with observed version. @returns Original committed change/no-op or registered progress, without sending messages. */
  async update(input: VersionedPolicyConfirmation & { patch: AdmissionPolicyPatch }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy });
      return authority.allowed ? { ok: true as const, value: await this.writer.update({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, expectedVersion: input.expectedVersion, patch: input.patch, type: ADMISSION_POLICY_OPERATION.update }) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Explicit activation of the observed draft. @returns Only the writer's original outcome after its current preflight, capability, country and CAS checks. */
  async activate(input: VersionedPolicyConfirmation) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.activateAdmissionPolicy });
      return authority.allowed ? { ok: true as const, value: await this.writer.activate({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, expectedVersion: input.expectedVersion, type: ADMISSION_POLICY_OPERATION.activate }) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Original reasoned closure intent; it cannot erase the protection marker or verification epoch. @returns Original pause outcome, independently of provider availability. */
  async pause(input: VersionedPolicyConfirmation & { reason: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.pauseAdmissionPolicy });
      return authority.allowed ? { ok: true as const, value: await this.writer.pause({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, expectedVersion: input.expectedVersion, reason: input.reason.trim(), type: ADMISSION_POLICY_OPERATION.pause }) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
