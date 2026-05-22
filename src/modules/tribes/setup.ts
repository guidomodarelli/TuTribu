import { createTribe } from "@/src/modules/tribes/application/use-cases/create-tribe-use-case";
import { getCurrentTribeMembershipStatus } from "@/src/modules/tribes/application/use-cases/get-current-tribe-membership-status-use-case";
import { getTribeBySlug } from "@/src/modules/tribes/application/use-cases/get-tribe-by-slug-use-case";
import { getTribeCreationEligibility } from "@/src/modules/tribes/application/use-cases/get-tribe-creation-eligibility-use-case";
import { getTribePageAccess } from "@/src/modules/tribes/application/use-cases/get-tribe-page-access-use-case";
import { getMemberTribes } from "@/src/modules/tribes/application/use-cases/get-member-tribes-use-case";
import { listVisibleTribeMembers } from "@/src/modules/tribes/application/use-cases/list-visible-tribe-members-use-case";
import {
  acceptTribeInvitation,
  createTribeInvitation,
  getTribeInvitationSubscriptionOffer,
  listTribeInvitations,
  revokeTribeInvitation,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-invitations-use-cases";
import {
  getEditableTribeWelcome,
  getTribeWelcome,
  getTribeWelcomeByInvitation,
  saveTribeWelcome,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-use-cases";
import {
  listTribeWelcomeSelections,
  recordTribeWelcomeSelection,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-selection-use-cases";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import type { TribeInvitationRepository } from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";
import type { TribeWelcomeRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";
import type { TribeWelcomeSelectionRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

type TribesModuleDependencies = {
  tribeReadRepository: TribeReadRepository;
  tribeCreationRepository: TribeCreationRepository;
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
  tribeInvitationRepository: TribeInvitationRepository;
  tribeWelcomeRepository: TribeWelcomeRepository;
  tribeWelcomeSelectionRepository: TribeWelcomeSelectionRepository;
};

export function buildTribesModule({
  tribeReadRepository,
  tribeCreationRepository,
  tribeCreatorWhitelistRepository,
  tribeInvitationRepository,
  tribeWelcomeRepository,
  tribeWelcomeSelectionRepository,
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
      listVisibleTribeMembers: listVisibleTribeMembers({
        tribeReadRepository,
      }),
      listTribeInvitations: listTribeInvitations({
        tribeInvitationRepository,
      }),
      createTribeInvitation: createTribeInvitation({
        tribeInvitationRepository,
      }),
      revokeTribeInvitation: revokeTribeInvitation({
        tribeInvitationRepository,
      }),
      acceptTribeInvitation: acceptTribeInvitation({
        tribeInvitationRepository,
      }),
      getTribeInvitationSubscriptionOffer: getTribeInvitationSubscriptionOffer({
        tribeInvitationRepository,
      }),
      getEditableTribeWelcome: getEditableTribeWelcome({
        tribeWelcomeRepository,
      }),
      getTribeWelcome: getTribeWelcome({
        tribeWelcomeRepository,
      }),
      getTribeWelcomeByInvitation: getTribeWelcomeByInvitation({
        tribeWelcomeRepository,
      }),
      saveTribeWelcome: saveTribeWelcome({
        tribeWelcomeRepository,
      }),
      recordTribeWelcomeSelection: recordTribeWelcomeSelection({
        tribeWelcomeSelectionRepository,
      }),
      listTribeWelcomeSelections: listTribeWelcomeSelections({
        tribeWelcomeSelectionRepository,
      }),
    },
  };
}
