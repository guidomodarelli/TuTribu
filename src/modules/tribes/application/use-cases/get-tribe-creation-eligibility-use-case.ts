import type { TribeCreatorWhitelistRepository } from "@/src/modules/tribes/domain/repositories/tribe-creator-whitelist-repository";

import type { TribeCreationEligibilityResult } from "../results/tribe-creation-eligibility-result";

type GetTribeCreationEligibilityDependencies = {
  tribeCreatorWhitelistRepository: TribeCreatorWhitelistRepository;
};

function normalizeEmail(email: string | null): string | null {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

export function getTribeCreationEligibility({
  tribeCreatorWhitelistRepository,
}: GetTribeCreationEligibilityDependencies) {
  return async ({
    creatorEmail,
  }: {
    creatorEmail: string | null;
  }): Promise<TribeCreationEligibilityResult> => {
    const normalizedEmail = normalizeEmail(creatorEmail);

    if (!normalizedEmail) {
      return {
        canCreate: false,
      };
    }

    return {
      canCreate: await tribeCreatorWhitelistRepository.isEmailAllowed(
        normalizedEmail
      ),
    };
  };
}
