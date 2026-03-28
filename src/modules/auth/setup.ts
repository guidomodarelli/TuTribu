import { getAuthenticatedMember } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";

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
