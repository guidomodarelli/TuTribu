import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";

import type { AuthenticatedMemberResult } from "../results/authenticated-member-result";

export class GetAuthenticatedMemberUseCase {
  constructor(private readonly authSessionRepository: AuthSessionRepository) {}

  async execute(): Promise<AuthenticatedMemberResult | null> {
    return this.authSessionRepository.getAuthenticatedMember();
  }
}
