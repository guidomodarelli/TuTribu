/** Resolves a compatibility entry's slug and delegates the original explicit intent to admission. @module submit-academy-entry-use-case */
import type { RequestAcademyAdmissionCommand } from "@/src/modules/tribes/domain/repositories/academy-admission-entry";
import type { SubmitAdmissionUseCase } from "./submit-admission-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { AdmissionCommittedOutcome } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** This entry cannot make a key, replace confirmation, select identity or write membership directly. */
export class SubmitAcademyEntryUseCase<Result extends AdmissionCommittedOutcome> {
  /** @param resolver - Own current slug lookup. @param submission - Native-account authoritative admission owner. */
  constructor(private readonly resolver: Pick<ResolveAdmissionTribeUseCase, "execute">, private readonly submission: Pick<SubmitAdmissionUseCase<Result>, "execute">) {}
  /** @param command - Boundary-validated original key/version/confirmation and correlation. @returns The owner's original outcome/progress/failure without translating pending to joined. */
  async execute(command: RequestAcademyAdmissionCommand) {
    try {
      const tribe = await this.resolver.execute({ slug: command.tribeSlug, requestId: command.requestId });
      if (!tribe.ok) return tribe;
      return await this.submission.execute({
        tribeId: tribe.value.tribeId, requestId: command.requestId, operationId: command.operationId, expectedPolicyVersion: command.expectedPolicyVersion, confirmed: command.confirmed,
        phone: command.phone, country: command.country, proofId: command.proofId, message: command.message, invitationToken: command.invitationToken, legacyInvitationToken: command.legacyInvitationToken,
        whatsappNumber: command.whatsappNumber,
      });
    } catch (error) { return admissionOperationFailure(error); }
  }
}
