import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";

import type { AuthenticatedMemberResult } from "../results/authenticated-member-result";

type GetAuthenticatedMemberDependencies = {
  authSessionRepository: AuthSessionRepository;
};

export function getAuthenticatedMember({
  authSessionRepository,
}: GetAuthenticatedMemberDependencies) {
  return async (): Promise<AuthenticatedMemberResult | null> => {
    return authSessionRepository.getAuthenticatedMember();
  };
}
