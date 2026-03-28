import { getAuthenticatedMember } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";
import { SupabaseAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/supabase-auth-session-repository";

export function createAuthModule() {
  const authSessionRepository = new SupabaseAuthSessionRepository();

  return {
    useCases: {
      getAuthenticatedMember: getAuthenticatedMember({
        authSessionRepository,
      }),
    },
  };
}
