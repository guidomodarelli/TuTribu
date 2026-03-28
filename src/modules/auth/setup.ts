import { GetAuthenticatedMemberUseCase } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";

import { SupabaseAuthSessionRepository } from "../repositories/supabase-auth-session-repository";

export function createGetAuthenticatedMemberUseCase(): GetAuthenticatedMemberUseCase {
  return new GetAuthenticatedMemberUseCase(new SupabaseAuthSessionRepository());
}
