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
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<{
    data: T | null;
    error: RecoverableSupabaseError | null;
  }>;
};

type SupabaseDatabaseClientFactory = () => Promise<SupabaseDatabaseClient>;

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
    error.code === "23505" &&
    normalizedMessage.includes("communities_slug_key")
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
      "create_private_community_with_owner_membership",
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
      throw new Error(error?.message ?? "Unable to create community.");
    }

    return mapCommunityRowToEntity(data);
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const supabase = await this.createClient();
    const { data, error } = await supabase.rpc<boolean>("is_community_slug_taken", {
      target_slug: slug,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data === true;
  }
}
