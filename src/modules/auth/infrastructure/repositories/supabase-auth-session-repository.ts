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

const AUTH_SESSION_ERROR_FRAGMENT = {
  missingName: "authsessionmissingerror",
  missingSession: "auth session missing",
} as const;

const AUTHENTICATED_MEMBER_DEFAULT = {
  avatarFallback: "AO",
  displayName: "Miembro",
  role: "member",
} as const;

const AUTHENTICATED_MEMBER_METADATA_KEY = {
  avatarUrl: "avatar_url",
  fullName: "full_name",
  name: "name",
  picture: "picture",
} as const;

const MAX_AVATAR_INITIALS = 2;

function isRecoverableAuthError(error: RecoverableAuthError | null): boolean {
  if (!error) {
    return false;
  }

  const normalizedName = error.name?.toLowerCase() ?? "";
  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedName.includes(AUTH_SESSION_ERROR_FRAGMENT.missingName) ||
    normalizedMessage.includes(AUTH_SESSION_ERROR_FRAGMENT.missingSession)
  );
}

function readMetadataValue(user: User, key: string): string | null {
  const value = user.user_metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildAvatarFallback(name?: string | null, email?: string | null): string {
  const source =
    name?.trim() || email?.trim() || AUTHENTICATED_MEMBER_DEFAULT.displayName;
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_AVATAR_INITIALS)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || AUTHENTICATED_MEMBER_DEFAULT.avatarFallback;
}

function mapUserToMember(user: User): AuthenticatedMember {
  const email = user.email?.trim() ?? "";
  const name =
    readMetadataValue(user, AUTHENTICATED_MEMBER_METADATA_KEY.fullName) ??
    readMetadataValue(user, AUTHENTICATED_MEMBER_METADATA_KEY.name) ??
    (email || AUTHENTICATED_MEMBER_DEFAULT.displayName);
  const image =
    readMetadataValue(user, AUTHENTICATED_MEMBER_METADATA_KEY.avatarUrl) ??
    readMetadataValue(user, AUTHENTICATED_MEMBER_METADATA_KEY.picture);

  return {
    id: user.id,
    email,
    name,
    role: AUTHENTICATED_MEMBER_DEFAULT.role,
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
