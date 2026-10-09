/** Resolves actual private leader/recency scope before delegating original personal invitation commands. @module manage-personal-invitations-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { PersonalInvitationReader, PersonalInvitationCommandWriter, PersonalInvitationQuery, PersonalInvitationReplacement } from "../../domain/repositories/personal-invitation-management";
import type { AdmissionContactType } from "../../domain/value-objects/admission-contact";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { normalizePersonalInvitationName } from "../../domain/value-objects/personal-invitation-name";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { admissionFailure } from "../results/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { personalInvitationCreationResultSchema, personalInvitationMutationOperationSchema } from "../../constants/personal-invitation-management-schemas";
import { presentPersonalInvitation, personalInvitationOperationFailure } from "../results/personal-invitation-result";

/** All browser proposals exclude actor, token/hash, role and arbitrary resource authority. */
type InvitationScope = { tribeId: string; requestId: string };
/** Only explicit confirmed mutations carry an original operation identity. */
type InvitationCommandScope = InvitationScope & { operationId: string; confirmed: true };

/** Administrative history remains separate from recipient preview/redemption. */
export class ManagePersonalInvitationsUseCases {
  /** @param resolver - Actual account/role/resource and signed recency owner. @param reader - Private metadata-only reader. @param writer - Atomic original command owner; no provider transport is involved. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: PersonalInvitationReader, private readonly writer: PersonalInvitationCommandWriter) {}
  /** @param input - Validated own bounded query. @returns Current guarded metadata, without mutation recency or token recovery. */
  async list(input: InvitationScope & PersonalInvitationQuery) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageInvitations });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const page = await this.reader.list(authority.context, { limit: input.limit, ...(input.status ? { status: input.status } : {}), ...(input.cursor ? { cursor: input.cursor } : {}) });
      if (page.invitations.some((invitation) => invitation.tribeId.toLowerCase() !== input.tribeId.toLowerCase())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: { items: page.invitations.map(presentPersonalInvitation), nextCursor: page.nextCursor } };
    } catch (error) { return admissionOperationFailure(error); }
  }
  /** @param input - Exact resource inside the native tribe. @returns Its current metadata or closed absence; token never comes from history. */
  async read(input: InvitationScope & { invitationId: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageInvitations, resource: { kind: ADMISSION_RESOURCE_KIND.personalInvitation, id: input.invitationId } });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const invitation = await this.reader.read(authority.context, input.invitationId);
      if (invitation && (invitation.id.toLowerCase() !== input.invitationId.toLowerCase() || invitation.tribeId.toLowerCase() !== input.tribeId.toLowerCase())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return invitation ? { ok: true as const, value: presentPersonalInvitation(invitation) } : { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.resourceUnavailable) };
    } catch (error) { return admissionOperationFailure(error); }
  }
  /** @param input - Explicit recipient/name/restrictions/expiry and optional observed replacement. @returns Original metadata, with a transient token only for a newly acknowledged creation. */
  async create(input: InvitationCommandScope & { contactType: AdmissionContactType; identity: string; country?: string; internalName: string; requiresAllowlist: boolean; allowlistExemptionAcknowledged: boolean; expiresAt?: Date | null; replacement?: PersonalInvitationReplacement }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageInvitations, sensitiveOperation: REAUTHENTICATION_OPERATION.createPersonalInvitation });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const contact = normalizeAdmissionContact({ type: input.contactType, value: input.identity, country: input.country });
      if (!input.confirmed || contact.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      const internalName = normalizePersonalInvitationName(input.internalName);
      if (!input.requiresAllowlist && !input.allowlistExemptionAcknowledged || input.expiresAt && !Number.isFinite(input.expiresAt.getTime()) || input.replacement && (!Number.isInteger(input.replacement.expectedVersion) || input.replacement.expectedVersion <= 0)) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      const result = await this.writer.create({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, contact: contact.contact, internalName, requiresAllowlist: input.requiresAllowlist, allowlistExemptionAcknowledged: input.allowlistExemptionAcknowledged, ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}), ...(input.replacement ? { replacement: input.replacement } : {}) });
      const parsed = personalInvitationCreationResultSchema.parse(result);
      if (parsed.operationId.toLowerCase() !== input.operationId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed };
    } catch (error) { return personalInvitationOperationFailure(error, input.operationId); }
  }
  /** @param input - Exact observed descriptive edit. @returns Original versioned metadata without changing recipient or restriction fields. */
  async rename(input: InvitationCommandScope & { invitationId: string; expectedVersion: number; internalName: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageInvitations, resource: { kind: ADMISSION_RESOURCE_KIND.personalInvitation, id: input.invitationId }, sensitiveOperation: REAUTHENTICATION_OPERATION.renamePersonalInvitation });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      if (!input.confirmed || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      const result = personalInvitationMutationOperationSchema.parse(await this.writer.rename({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, invitationId: input.invitationId, expectedVersion: input.expectedVersion, internalName: normalizePersonalInvitationName(input.internalName) }));
      if (result.operationId.toLowerCase() !== input.operationId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      if (result.state === OPERATION_STATE.completed) {
        const snapshot = result.result;
        if (snapshot.invitationId.toLowerCase() !== input.invitationId.toLowerCase() || snapshot.created || snapshot.version !== input.expectedVersion + (snapshot.changed ? 1 : 0)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      }
      return { ok: true as const, value: result };
    } catch (error) { return personalInvitationOperationFailure(error, input.operationId); }
  }
  /** @param input - Explicit active revoke or redeemed authorization withdrawal with reason and observed version. @returns The original result; related pending cancellation is owned by the same transaction. */
  async revoke(input: InvitationCommandScope & { invitationId: string; expectedVersion: number; revokeRedeemedAuthorization: boolean; internalReason: string }) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.manageInvitations, resource: { kind: ADMISSION_RESOURCE_KIND.personalInvitation, id: input.invitationId }, sensitiveOperation: REAUTHENTICATION_OPERATION.revokePersonalInvitation });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      if (!input.confirmed || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0 || !input.internalReason.trim() || input.internalReason.trim().length > ADMISSION_LIMIT.internalMessageCharacters) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.invalidInput) };
      const result = personalInvitationMutationOperationSchema.parse(await this.writer.revoke({ context: authority.context, operationId: input.operationId, confirmed: input.confirmed, invitationId: input.invitationId, expectedVersion: input.expectedVersion, revokeRedeemedAuthorization: input.revokeRedeemedAuthorization, internalReason: input.internalReason.trim() }));
      if (result.operationId.toLowerCase() !== input.operationId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      if (result.state === OPERATION_STATE.completed) {
        const snapshot = result.result;
        if (snapshot.invitationId.toLowerCase() !== input.invitationId.toLowerCase() || snapshot.created || snapshot.version !== input.expectedVersion + (snapshot.changed ? 1 : 0)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      }
      return { ok: true as const, value: result };
    } catch (error) { return personalInvitationOperationFailure(error, input.operationId); }
  }
}
