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
  getTribeInvitationConversionMetrics,
  listTribeInvitations,
  listTribeInvitationsByPrice,
  revokeTribeInvitation,
  updateTribeInvitationSubscriptionAssociation,
  updateTribeInvitationReferralMetadata,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-invitations-use-cases";
import {
  getEditableTribeWelcome,
  getTribeWelcome,
  getTribeWelcomeByInvitation,
  saveTribeWelcome,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-use-cases";
import {
  listCurrentMemberTribeWelcomeSelections,
  listTribeWelcomeSelections,
  recordTribeWelcomeSelection,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-welcome-selection-use-cases";
import {
  getTribeSupport,
  saveTribeSupport,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-support-use-cases";
import {
  getTribeStory,
  getTribeStoryStats,
  saveTribeStory,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-story-use-cases";
import { joinTribeFree } from "@/src/modules/tribes/application/use-cases/join-tribe-free-use-case";
import { touchTribePresence } from "@/src/modules/tribes/application/use-cases/manage-tribe-presence-use-cases";
import {
  createTribeStoryImageUpload,
  deleteTribeStoryImageUpload,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-story-image-use-cases";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import type { TribeInvitationRepository } from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";
import type { TribeFreeJoinRepository } from "@/src/modules/tribes/domain/repositories/tribe-free-join-repository";
import type { TribePresenceRepository } from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";
import type { TribeStoryImageRepository } from "@/src/modules/tribes/domain/repositories/tribe-story-image-repository";
import type { TribeStoryRepository } from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { TribeSupportRepository } from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import type { TribeWelcomeRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";
import type { TribeWelcomeSelectionRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

type TribesModuleDependencies = {
  tribeReadRepository: TribeReadRepository;
  tribeCreationRepository: TribeCreationRepository;
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
  tribeInvitationRepository: TribeInvitationRepository;
  tribeFreeJoinRepository: TribeFreeJoinRepository;
  tribePresenceRepository: TribePresenceRepository;
  tribeStoryImageRepository: TribeStoryImageRepository;
  tribeStoryRepository: TribeStoryRepository;
  tribeSupportRepository: TribeSupportRepository;
  tribeWelcomeRepository: TribeWelcomeRepository;
  tribeWelcomeSelectionRepository: TribeWelcomeSelectionRepository;
};

export function buildTribesModule({
  tribeReadRepository,
  tribeCreationRepository,
  tribeCreatorWhitelistRepository,
  tribeInvitationRepository,
  tribeFreeJoinRepository,
  tribePresenceRepository,
  tribeStoryImageRepository,
  tribeStoryRepository,
  tribeSupportRepository,
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
      listTribeInvitationsByPrice: listTribeInvitationsByPrice({
        tribeInvitationRepository,
      }),
      createTribeInvitation: createTribeInvitation({
        tribeInvitationRepository,
      }),
      updateTribeInvitationSubscriptionAssociation:
        updateTribeInvitationSubscriptionAssociation({
          tribeInvitationRepository,
        }),
      updateTribeInvitationReferralMetadata:
        updateTribeInvitationReferralMetadata({
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
      getTribeInvitationConversionMetrics:
        getTribeInvitationConversionMetrics({
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
      listCurrentMemberTribeWelcomeSelections:
        listCurrentMemberTribeWelcomeSelections({
          tribeWelcomeSelectionRepository,
        }),
      listTribeWelcomeSelections: listTribeWelcomeSelections({
        tribeWelcomeSelectionRepository,
      }),
      getTribeSupport: getTribeSupport({
        tribeSupportRepository,
      }),
      saveTribeSupport: saveTribeSupport({
        tribeSupportRepository,
      }),
      getTribeStory: getTribeStory({
        tribeStoryRepository,
      }),
      getTribeStoryStats: getTribeStoryStats({
        tribeStoryRepository,
      }),
      joinTribeFree: joinTribeFree({
        tribeFreeJoinRepository,
      }),
      touchTribePresence: touchTribePresence({
        tribePresenceRepository,
      }),
      createTribeStoryImageUpload: createTribeStoryImageUpload({
        tribeStoryImageRepository,
      }),
      deleteTribeStoryImageUpload: deleteTribeStoryImageUpload({
        tribeStoryImageRepository,
      }),
      saveTribeStory: saveTribeStory({
        tribeStoryRepository,
      }),
    },
  };
}
