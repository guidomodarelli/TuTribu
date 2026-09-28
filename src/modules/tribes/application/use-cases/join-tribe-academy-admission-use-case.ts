import type {
  JoinTribeAcademyAdmissionCommand,
  TribeAcademyAdmissionRepository,
  TribeAcademyAdmissionStatus,
} from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";

/**
 * Joins the current user to an academy-mode tribe as a basic member. The
 * second call returns the existing membership; conduct blocks and removals
 * are never undone.
 *
 * @param dependencies - Admission repository.
 * @returns Use case.
 */
export function joinTribeAcademyAdmission({
  tribeAcademyAdmissionRepository,
}: {
  tribeAcademyAdmissionRepository: TribeAcademyAdmissionRepository;
}) {
  return async (
    command: JoinTribeAcademyAdmissionCommand
  ): Promise<{ status: TribeAcademyAdmissionStatus }> =>
    tribeAcademyAdmissionRepository.join({
      tribeSlug: command.tribeSlug.trim().toLowerCase(),
    });
}
