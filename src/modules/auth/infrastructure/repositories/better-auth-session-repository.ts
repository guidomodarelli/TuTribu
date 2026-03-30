import type { AuthenticatedMember } from "@/src/modules/auth/domain/entities/authenticated-member";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";
import type { BetterAuthSession } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";

type BetterAuthSessionGetter = () => Promise<BetterAuthSession>;

async function getDefaultBetterAuthSession() {
  const { getServerBetterAuthSession } = await import(
    "@/src/modules/auth/infrastructure/better-auth/server-auth-context"
  );

  return getServerBetterAuthSession();
}

const AUTHENTICATED_MEMBER_DEFAULT = {
  avatarFallback: "AO",
  displayName: "Miembro",
  role: "member",
} as const;

const MAX_AVATAR_INITIALS = 2;

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

function mapSessionToMember(session: NonNullable<BetterAuthSession>): AuthenticatedMember {
  const email = session.user.email?.trim() ?? "";
  const name = session.user.name?.trim() || email || AUTHENTICATED_MEMBER_DEFAULT.displayName;

  return {
    id: session.user.id,
    email,
    name,
    role: AUTHENTICATED_MEMBER_DEFAULT.role,
    avatarFallback: buildAvatarFallback(name, email),
    image: session.user.image ?? null,
  };
}

export class BetterAuthSessionRepository implements AuthSessionRepository {
  constructor(
    private readonly getSession: BetterAuthSessionGetter = getDefaultBetterAuthSession
  ) {}

  async getAuthenticatedMember(): Promise<AuthenticatedMember | null> {
    const session = await this.getSession();

    if (!session) {
      return null;
    }

    return mapSessionToMember(session);
  }
}
