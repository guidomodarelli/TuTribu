import { createTribe } from "@/src/modules/tribes/application/use-cases/create-tribe-use-case";
import { getCurrentTribeMembershipStatus } from "@/src/modules/tribes/application/use-cases/get-current-tribe-membership-status-use-case";
import { getTribeBySlug } from "@/src/modules/tribes/application/use-cases/get-tribe-by-slug-use-case";
import { getTribeCreationEligibility } from "@/src/modules/tribes/application/use-cases/get-tribe-creation-eligibility-use-case";
import { getTribePageAccess } from "@/src/modules/tribes/application/use-cases/get-tribe-page-access-use-case";
import { getMemberTribes } from "@/src/modules/tribes/application/use-cases/get-member-tribes-use-case";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

type TribesModuleDependencies = {
  tribeReadRepository: TribeReadRepository;
  tribeCreationRepository: TribeCreationRepository;
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
};

export function buildTribesModule({
  tribeReadRepository,
  tribeCreationRepository,
  tribeCreatorWhitelistRepository,
}: TribesModuleDependencies) {
  return {
    useCases: {
      createTribe: createTribe({
        tribeCreatorWhitelistRepository,
        tribeCreationRepository,
      }),
      getTribeBySlug: getTribeBySlug({
        tribeReadRepository,
      }),
      getTribeCreationEligibility: getTribeCreationEligibility({
        tribeCreatorWhitelistRepository,
      }),
      getCurrentTribeMembershipStatus: getCurrentTribeMembershipStatus({
        tribeReadRepository,
      }),
      getTribePageAccess: getTribePageAccess({
        tribeReadRepository,
      }),
      getMemberTribes: getMemberTribes({
        tribeReadRepository,
      }),
    },
  };
}
