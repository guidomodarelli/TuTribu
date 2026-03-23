import { getServerSession } from "next-auth";
import type { Session } from "next-auth";

import type { AuthenticatedMember } from "@/src/modules/auth/domain/entities/authenticated-member";
import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";

import { authOptions } from "../next-auth/auth-options";

type SessionResolver = () => Promise<Session | null>;

function isRecoverableNextAuthSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedMessage.includes("jwt_session_error") ||
    normalizedMessage.includes("decryption operation failed")
  );
}

function buildAvatarFallback(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "Member";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "AO";
}

function mapSessionToMember(session: Session): AuthenticatedMember {
  const resolvedName = session.user?.name?.trim() || session.user?.email || "Member";

  return {
    id: session.user?.email || resolvedName,
    name: resolvedName,
    role: "member",
    avatarFallback: buildAvatarFallback(session.user?.name, session.user?.email),
    image: session.user?.image ?? null,
  };
}

export class NextAuthSessionRepository implements AuthSessionRepository {
  constructor(
    private readonly resolveSession: SessionResolver = () =>
      getServerSession(authOptions)
  ) {}

  async getAuthenticatedMember(): Promise<AuthenticatedMember | null> {
    let session: Session | null;

    try {
      session = await this.resolveSession();
    } catch (error) {
      if (isRecoverableNextAuthSessionError(error)) {
        return null;
      }

      throw error;
    }

    if (!session?.user) {
      return null;
    }

    return mapSessionToMember(session);
  }
}
