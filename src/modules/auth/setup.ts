import { getAuthenticatedMember } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";
import { BetterAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/better-auth-session-repository";
import {createRequestAuthenticatedAccountProvider} from "@/src/modules/auth/infrastructure/composition/authenticated-account-provider";
import type {AuthenticatedAccountProvider} from "@/src/modules/auth/domain/repositories/authenticated-account-provider";

type AuthModuleDependencies = {
  authSessionRepository: AuthSessionRepository;
  authenticatedAccountProvider?:AuthenticatedAccountProvider;
};

export function buildAuthModule({
  authSessionRepository,
  authenticatedAccountProvider,
}: AuthModuleDependencies) {
  return {
    useCases: {
      getAuthenticatedAccount:()=>authenticatedAccountProvider?.getAuthenticatedAccount()??Promise.resolve(null),
      getAuthenticatedMember: getAuthenticatedMember({
        authSessionRepository,
      }),
    },
  };
}

export function createRequestAuthModule() {
  return buildAuthModule({
    authSessionRepository: new BetterAuthSessionRepository(),
    authenticatedAccountProvider:createRequestAuthenticatedAccountProvider(),
  });
}
