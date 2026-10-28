import { createTribe } from "@/src/modules/tribes/application/use-cases/create-tribe-use-case";
import { TransferTribeLeadershipUseCase } from "./application/use-cases/transfer-tribe-leadership-use-case";
import { PostgresTribeLeadershipRepository, type TribeLeadershipDatabaseExecutor } from "./infrastructure/repositories/postgres-tribe-leadership-repository";
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { ManageTribeMembershipUseCases } from "./application/use-cases/manage-tribe-membership-use-cases";
import { ManageTribeLifecycleUseCases } from "./application/use-cases/manage-tribe-lifecycle-use-cases";
import { PostgresTribeLifecycleRepository, type TribeLifecycleDatabaseExecutor, type AdmissionScopeClosureFactory } from "./infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { PostgresTribeMembershipLifecycleRepository, type TribeMembershipLifecycleDatabaseExecutor, type AdmissionMembershipLifecycleFactory } from "./infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";

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
  getTribeStoryOnlineMembers,
  getTribeStoryStats,
  listPublicTribeStorySlugs,
  saveTribeStory,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-story-use-cases";
import { joinTribeFree } from "@/src/modules/tribes/application/use-cases/join-tribe-free-use-case";
import { joinTribeAcademyAdmission } from "@/src/modules/tribes/application/use-cases/join-tribe-academy-admission-use-case";
import type { TribeAcademyAdmissionRepository } from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";
import { touchTribePresence } from "@/src/modules/tribes/application/use-cases/manage-tribe-presence-use-cases";
import {
  cleanupOrphanTribeImages,
  createTribeImageUpload,
  deleteTribeImageUpload,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-image-use-cases";
import {
  getTribeIdentity,
  saveTribeIdentity,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-identity-use-cases";
import type { TribeCreationRepository } from "@/src/modules/tribes/domain/repositories/tribe-creation-repository";
import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";
import type { TribeInvitationRepository } from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";
import type { TribeFreeJoinRepository } from "@/src/modules/tribes/domain/repositories/tribe-free-join-repository";
import type { TribePresenceRepository } from "@/src/modules/tribes/domain/repositories/tribe-presence-repository";
import type { TribeIdentityRepository } from "@/src/modules/tribes/domain/repositories/tribe-identity-repository";
import type { TribeImageRepository } from "@/src/modules/tribes/domain/repositories/tribe-image-repository";
import type { TribeStoryRepository } from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import type { TribeSupportRepository } from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import type { TribeWelcomeRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-repository";
import type { TribeWelcomeSelectionRepository } from "@/src/modules/tribes/domain/repositories/tribe-welcome-selection-repository";

import type { AcademyAdmissionEntry } from "./domain/repositories/academy-admission-entry";

type TribesModuleDependencies<AdmissionResult> = {
  academyAdmissionEntry: AcademyAdmissionEntry<AdmissionResult>;
  tribeAcademyAdmissionRepository: TribeAcademyAdmissionRepository;
  tribeReadRepository: TribeReadRepository;
  tribeCreationRepository: TribeCreationRepository;
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
  tribeInvitationRepository: TribeInvitationRepository;
  tribeFreeJoinRepository: TribeFreeJoinRepository;
  tribePresenceRepository: TribePresenceRepository;
  tribeIdentityRepository: TribeIdentityRepository;
  tribeImageRepository: TribeImageRepository;
  tribeStoryRepository: TribeStoryRepository;
  tribeSupportRepository: TribeSupportRepository;
  tribeWelcomeRepository: TribeWelcomeRepository;
  tribeWelcomeSelectionRepository: TribeWelcomeSelectionRepository;
};

/**
 * Builds the tribe invitation use cases.
 *
 * @param tribeInvitationRepository - Repository the use cases read and write.
 * @returns Use cases keyed by name.
 */
function buildTribeInvitationUseCases(tribeInvitationRepository: TribeInvitationRepository) {
  return {
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
  };
}

/**
 * Builds the tribe welcome use cases.
 *
 * @param tribeWelcomeRepository - Repository the use cases read and write.
 * @returns Use cases keyed by name.
 */
function buildTribeWelcomeUseCases(tribeWelcomeRepository: TribeWelcomeRepository) {
  return {
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
  };
}

/**
 * Builds the tribe welcome selection use cases.
 *
 * @param tribeWelcomeSelectionRepository - Repository the use cases read and write.
 * @returns Use cases keyed by name.
 */
function buildTribeWelcomeSelectionUseCases(tribeWelcomeSelectionRepository: TribeWelcomeSelectionRepository) {
  return {
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
  };
}

/**
 * Builds the tribe story use cases.
 *
 * @param tribeStoryRepository - Repository the use cases read and write.
 * @returns Use cases keyed by name.
 */
function buildTribeStoryUseCases(tribeStoryRepository: TribeStoryRepository) {
  return {
    getTribeStory: getTribeStory({
      tribeStoryRepository,
    }),
    getTribeStoryStats: getTribeStoryStats({
      tribeStoryRepository,
    }),
    getTribeStoryOnlineMembers: getTribeStoryOnlineMembers({
      tribeStoryRepository,
    }),
    listPublicTribeStorySlugs: listPublicTribeStorySlugs({
      tribeStoryRepository,
    }),
    saveTribeStory: saveTribeStory({
      tribeStoryRepository,
    }),
  };
}

/**
 * Builds the tribe read use cases.
 *
 * @param tribeReadRepository - Repository the use cases read and write.
 * @returns Use cases keyed by name.
 */
function buildTribeReadUseCases(tribeReadRepository: TribeReadRepository) {
  return {
    getTribeBySlug: getTribeBySlug({
      tribeReadRepository,
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
  };
}

export function buildTribesModule<AdmissionResult>({
  academyAdmissionEntry,
  tribeAcademyAdmissionRepository,
  tribeReadRepository,
  tribeCreationRepository,
  tribeCreatorWhitelistRepository,
  tribeInvitationRepository,
  tribeFreeJoinRepository,
  tribePresenceRepository,
  tribeIdentityRepository,
  tribeImageRepository,
  tribeStoryRepository,
  tribeSupportRepository,
  tribeWelcomeRepository,
  tribeWelcomeSelectionRepository,
}: TribesModuleDependencies<AdmissionResult>) {
  return {
    useCases: {
      ...buildTribeInvitationUseCases(tribeInvitationRepository),
      ...buildTribeWelcomeUseCases(tribeWelcomeRepository),
      ...buildTribeWelcomeSelectionUseCases(tribeWelcomeSelectionRepository),
      ...buildTribeStoryUseCases(tribeStoryRepository),
      ...buildTribeReadUseCases(tribeReadRepository),
      joinTribeAcademyAdmission: joinTribeAcademyAdmission({
        tribeAcademyAdmissionRepository,
        academyAdmissionEntry,
      }),
      createTribe: createTribe({
        tribeCreatorWhitelistRepository,
        tribeCreationRepository,
      }),
      getTribeCreationEligibility: getTribeCreationEligibility({
        tribeCreatorWhitelistRepository,
      }),
      getTribeSupport: getTribeSupport({
        tribeSupportRepository,
      }),
      saveTribeSupport: saveTribeSupport({
        tribeSupportRepository,
      }),
      cleanupOrphanTribeImages: cleanupOrphanTribeImages({
        tribeImageRepository,
      }),
      joinTribeFree: joinTribeFree({
        tribeFreeJoinRepository,
      }),
      touchTribePresence: touchTribePresence({
        tribePresenceRepository,
      }),
      createTribeImageUpload: createTribeImageUpload({
        tribeImageRepository,
      }),
      deleteTribeImageUpload: deleteTribeImageUpload({
        tribeImageRepository,
      }),
      getTribeIdentity: getTribeIdentity({
        tribeIdentityRepository,
      }),
      saveTribeIdentity: saveTribeIdentity({
        tribeIdentityRepository,
      }),
    },
  };
}

/** @param dependencies - Native identity, guarded executor, operation configuration and admission owner on the same transaction. @returns Explicit membership actions and original recovery without loading a messaging credential. */
export function buildTribeMembershipLifecycleModule(dependencies: { accounts: AuthenticatedAccountProvider; execute: TribeMembershipLifecycleDatabaseExecutor; readSecurityConfig: () => Promise<MessagingSecurityConfig>; admission: AdmissionMembershipLifecycleFactory; clock?: () => Date }) {
  return { useCases: new ManageTribeMembershipUseCases(dependencies.accounts, new PostgresTribeMembershipLifecycleRepository(dependencies.execute, dependencies.readSecurityConfig, dependencies.admission), dependencies.clock) };
}

/** @param dependencies - Native account, owner transaction, retained MAC keys and admission closure on the same transaction. @returns Explicit mode exit/deletion and original read-only recovery. */
export function buildTribeLifecycleModule(dependencies: { accounts: AuthenticatedAccountProvider; execute: TribeLifecycleDatabaseExecutor; readSecurityConfig: () => Promise<MessagingSecurityConfig>; admission: AdmissionScopeClosureFactory; clock?: () => Date }) {
  return { useCases: new ManageTribeLifecycleUseCases(dependencies.accounts, new PostgresTribeLifecycleRepository(dependencies.execute, dependencies.readSecurityConfig, dependencies.admission), dependencies.clock) };
}

/** @param dependencies - Native account, fixed actor executor and independent operation MAC snapshot. @returns An explicit tribal owner without provider, SecretStore, public route or general transfer UI. */
export function buildTribeLeadershipModule(dependencies:{accounts:AuthenticatedAccountProvider;execute:TribeLeadershipDatabaseExecutor;readSecurityConfig:()=>Promise<MessagingSecurityConfig>;clock?:()=>Date}){
  const writer=new PostgresTribeLeadershipRepository(dependencies.execute,dependencies.readSecurityConfig);
  return{useCases:{transferLeadership:new TransferTribeLeadershipUseCase(dependencies.accounts,writer,dependencies.clock)}};
}
