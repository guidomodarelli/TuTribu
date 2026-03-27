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

const COMMUNITY_CREATOR_WHITELIST = {
  emailColumn: "email",
  missingTableCode: "PGRST205",
  schemaCacheMessage: "schema cache",
  tableName: "community_creator_whitelist",
} as const;

function isMissingWhitelistTableError(error: RecoverableSupabaseError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    error.code === COMMUNITY_CREATOR_WHITELIST.missingTableCode ||
    normalizedMessage.includes(COMMUNITY_CREATOR_WHITELIST.tableName) &&
      normalizedMessage.includes(COMMUNITY_CREATOR_WHITELIST.schemaCacheMessage)
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
    const whitelistTable = supabase.from(COMMUNITY_CREATOR_WHITELIST.tableName) as {
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
      .select(COMMUNITY_CREATOR_WHITELIST.emailColumn)
      .eq(COMMUNITY_CREATOR_WHITELIST.emailColumn, normalizedEmail)
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
