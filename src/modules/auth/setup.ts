import { getAuthenticatedMember } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";
import { BetterAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/better-auth-session-repository";

type AuthModuleDependencies = {
  authSessionRepository: AuthSessionRepository;
};

export function buildAuthModule({
  authSessionRepository,
}: AuthModuleDependencies) {
  return {
    useCases: {
      getAuthenticatedMember: getAuthenticatedMember({
        authSessionRepository,
      }),
    },
  };
}

export function createRequestAuthModule() {
  return buildAuthModule({
    authSessionRepository: new BetterAuthSessionRepository(),
  });
}
