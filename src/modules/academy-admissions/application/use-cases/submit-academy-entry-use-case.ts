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
      const { tribeSlug: _tribeSlug, ...intent } = command;
      return this.submission.execute({ ...intent, tribeId: tribe.value.tribeId });
    } catch (error) { return admissionOperationFailure(error); }
  }
}
