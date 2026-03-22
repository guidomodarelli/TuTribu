import { GetAuthenticatedMemberUseCase } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";

import { NextAuthSessionRepository } from "../repositories/next-auth-session-repository";

export function createGetAuthenticatedMemberUseCase(): GetAuthenticatedMemberUseCase {
  return new GetAuthenticatedMemberUseCase(new NextAuthSessionRepository());
}
