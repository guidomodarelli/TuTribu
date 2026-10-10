import type {
  JoinTribeAcademyAdmissionCommand,
  TribeAcademyAdmissionRepository,
  TribeAcademyAdmissionStatus,
} from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";
import type { AcademyAdmissionEntry, RequestAcademyAdmissionCommand } from "@/src/modules/tribes/domain/repositories/academy-admission-entry";

/**
 * Routes explicit versioned entry to its admission owner. Historical direct
 * calls remain scoped by the legacy repository's irreversible cutover guard.
 *
 * @param dependencies - Admission repository.
 * @returns Use case.
 */
export function joinTribeAcademyAdmission<AdmissionResult>({
  tribeAcademyAdmissionRepository,
  academyAdmissionEntry,
}: {
  tribeAcademyAdmissionRepository: TribeAcademyAdmissionRepository;
  academyAdmissionEntry: AcademyAdmissionEntry<AdmissionResult>;
}) {
  function execute(command: RequestAcademyAdmissionCommand): Promise<AdmissionResult>;
  function execute(command: JoinTribeAcademyAdmissionCommand): Promise<{ status: TribeAcademyAdmissionStatus }>;
  async function execute(command: JoinTribeAcademyAdmissionCommand | RequestAcademyAdmissionCommand) {
    const tribeSlug = command.tribeSlug.trim().toLowerCase();
    return "operationId" in command ? academyAdmissionEntry.submit({ ...command, tribeSlug }) : tribeAcademyAdmissionRepository.join({ tribeSlug });
  }
  return execute;
}
