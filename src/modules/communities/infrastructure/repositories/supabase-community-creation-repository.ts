import type { Community } from "@/src/modules/communities/domain/entities/community";
import { CommunitySlugConflictError } from "@/src/modules/communities/domain/errors/community-slug-conflict-error";
import type { CommunityCreationRepository } from "@/src/modules/communities/domain/repositories/community-creation-repository";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

type RecoverableSupabaseError = {
  code?: string;
  message: string;
};

type SupabaseCommunityRow = {
  id: string;
  name: string;
  slug: string;
  visibility: "private";
};

type SupabaseDatabaseClient = {
  from: (table: string) => unknown;
  rpc: <T>(fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: T | null;
    error: RecoverableSupabaseError | null;
  }>;
};

type SupabaseDatabaseClientFactory = () => Promise<SupabaseDatabaseClient>;

const COMMUNITY_CREATION_ERROR = {
  slugConflictCode: "23505",
  slugConstraintName: "communities_slug_key",
  unavailableCreateMessage: "Unable to create community.",
} as const;

const COMMUNITY_CREATION_RPC = {
  createPrivateCommunityWithOwnerMembership:
    "create_private_community_with_owner_membership",
  isCommunitySlugTaken: "is_community_slug_taken",
} as const;

function mapCommunityRowToEntity(row: SupabaseCommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    visibility: row.visibility,
  };
}

function isSlugConflictError(error: RecoverableSupabaseError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    error.code === COMMUNITY_CREATION_ERROR.slugConflictCode &&
    normalizedMessage.includes(COMMUNITY_CREATION_ERROR.slugConstraintName)
  );
}

export class SupabaseCommunityCreationRepository
  implements CommunityCreationRepository
{
  constructor(
    private readonly createClient: SupabaseDatabaseClientFactory =
      createServerSupabaseClient
  ) {}

  async createCommunityWithOwnerMembership(input: {
    name: string;
    ownerId: string;
    slug: string;
    visibility: "private";
  }): Promise<Community> {
    const supabase = await this.createClient();
    const { data, error } = await supabase.rpc<SupabaseCommunityRow>(
      COMMUNITY_CREATION_RPC.createPrivateCommunityWithOwnerMembership,
      {
        target_name: input.name,
        target_owner_id: input.ownerId,
        target_slug: input.slug,
      }
    );

    if (isSlugConflictError(error)) {
      throw new CommunitySlugConflictError();
    }

    if (error || !data) {
      throw new Error(
        error?.message ?? COMMUNITY_CREATION_ERROR.unavailableCreateMessage
      );
    }

    return mapCommunityRowToEntity(data);
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const supabase = await this.createClient();
    const { data, error } = await supabase.rpc<boolean>(
      COMMUNITY_CREATION_RPC.isCommunitySlugTaken,
      {
        target_slug: slug,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return data === true;
  }
}
