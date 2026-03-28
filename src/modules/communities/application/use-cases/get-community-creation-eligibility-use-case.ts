import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";

import type { CommunityCreationEligibilityResult } from "../results/community-creation-eligibility-result";

type GetCommunityCreationEligibilityDependencies = {
  communityCreatorWhitelistRepository: CommunityCreatorWhitelistRepository;
};

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

export function getCommunityCreationEligibility({
  communityCreatorWhitelistRepository,
}: GetCommunityCreationEligibilityDependencies) {
  return async ({
    creatorEmail,
  }: {
    creatorEmail: string | null;
  }): Promise<CommunityCreationEligibilityResult> => {
    const normalizedEmail = normalizeEmail(creatorEmail);

    if (!normalizedEmail) {
      return {
        canCreate: false,
      };
    }

    return {
      canCreate: await communityCreatorWhitelistRepository.isEmailAllowed(
        normalizedEmail
      ),
    };
  };
}
