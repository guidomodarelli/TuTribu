import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";

import type { CommunityCreationEligibilityResult } from "../results/community-creation-eligibility-result";

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

export class GetCommunityCreationEligibilityUseCase {
  constructor(
    private readonly communityCreatorWhitelistRepository: CommunityCreatorWhitelistRepository
  ) {}

  async execute({
    creatorEmail,
  }: {
    creatorEmail: string | null;
  }): Promise<CommunityCreationEligibilityResult> {
    const normalizedEmail = normalizeEmail(creatorEmail);

    if (!normalizedEmail) {
      return {
        canCreate: false,
      };
    }

    return {
      canCreate: await this.communityCreatorWhitelistRepository.isEmailAllowed(
        normalizedEmail
      ),
    };
  }
}
