import type { CommunityCreatorWhitelistRepository } from "@/src/modules/communities/domain/repositories/community-creator-whitelist-repository";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

type RecoverableSupabaseError = {
  code?: string;
  message: string;
};

type SupabaseDatabaseClient = {
  from: (table: string) => unknown;
};

type SupabaseDatabaseClientFactory = () => Promise<SupabaseDatabaseClient>;

function isMissingWhitelistTableError(error: RecoverableSupabaseError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    error.code === "PGRST205" ||
    normalizedMessage.includes("community_creator_whitelist") &&
      normalizedMessage.includes("schema cache")
  );
}

export class SupabaseCommunityCreatorWhitelistRepository
  implements CommunityCreatorWhitelistRepository
{
  constructor(
    private readonly createClient: SupabaseDatabaseClientFactory =
      createServerSupabaseClient
  ) {}

  async isEmailAllowed(email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = await this.createClient();
    const whitelistTable = supabase.from("community_creator_whitelist") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { email: string } | null;
            error: RecoverableSupabaseError | null;
          }>;
        };
      };
    };
    const { data, error } = await whitelistTable
      .select("email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (isMissingWhitelistTableError(error)) {
      return false;
    }

    if (error) {
      throw new Error(error.message);
    }

    return Boolean(data);
  }
}
