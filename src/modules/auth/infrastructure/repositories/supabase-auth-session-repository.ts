import type { User } from "@supabase/supabase-js";

import type { AuthenticatedMember } from "@/src/modules/auth/domain/entities/authenticated-member";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";
import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

type RecoverableAuthError = {
  message: string;
  name?: string;
};

type SupabaseAuthClient = {
  auth: {
    getUser: () => Promise<{
      data: {
        user: User | null;
      };
      error: RecoverableAuthError | null;
    }>;
  };
};

type SupabaseAuthClientFactory = () => Promise<SupabaseAuthClient>;

function isRecoverableAuthError(error: RecoverableAuthError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedName = error.name?.toLowerCase() ?? "";
  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedName.includes("authsessionmissingerror") ||
    normalizedMessage.includes("auth session missing")
  );
}

function readMetadataValue(user: User, key: string): string | null {
  const value = user.user_metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildAvatarFallback(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "Miembro";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "AO";
}

function mapUserToMember(user: User): AuthenticatedMember {
  const email = user.email?.trim() ?? "";
  const name =
    readMetadataValue(user, "full_name") ??
    readMetadataValue(user, "name") ??
    (email || "Miembro");
  const image =
    readMetadataValue(user, "avatar_url") ?? readMetadataValue(user, "picture");

  return {
    id: user.id,
    email,
    name,
    role: "member",
    avatarFallback: buildAvatarFallback(name, email),
    image,
  };
}

export class SupabaseAuthSessionRepository implements AuthSessionRepository {
  constructor(
    private readonly createClient: SupabaseAuthClientFactory = createServerSupabaseClient
  ) {}

  async getAuthenticatedMember(): Promise<AuthenticatedMember | null> {
    const supabase = await this.createClient();
    const { data, error } = await supabase.auth.getUser();

    if (isRecoverableAuthError(error)) {
      return null;
    }

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      return null;
    }

    return mapUserToMember(data.user);
  }
}
