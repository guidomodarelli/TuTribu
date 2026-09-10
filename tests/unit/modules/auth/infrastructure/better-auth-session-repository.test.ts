import { describe, it, expect } from "vitest";
import { BetterAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/better-auth-session-repository";

describe("BetterAuthSessionRepository", () => {
  it("maps the Better Auth session into an authenticated member", async () => {
    const repository = new BetterAuthSessionRepository(async () => ({
      session: { createdAt: new Date(0), updatedAt: new Date(0), expiresAt: new Date(1), token: "test-session-token",
        id: "session-1",
        userId: "member-1",
      },
      user: { createdAt: new Date(0), updatedAt: new Date(0), emailVerified: true,
        id: "member-1",
        email: "member@example.com",
        image: "https://example.com/avatar.png",
        name: "TuTribu Member",
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toEqual({
      id: "member-1",
      email: "member@example.com",
      name: "TuTribu Member",
      role: "tribemate",
      avatarFallback: "TM",
      image: "https://example.com/avatar.png",
    });
  });

  it("falls back to the email when the name is missing", async () => {
    const repository = new BetterAuthSessionRepository(async () => ({
      session: { createdAt: new Date(0), updatedAt: new Date(0), expiresAt: new Date(1), token: "test-session-token",
        id: "session-1",
        userId: "member-1",
      },
      user: { createdAt: new Date(0), updatedAt: new Date(0), emailVerified: true,
        id: "member-1",
        email: "member@example.com",
        image: null,
        name: null as unknown as string,
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toEqual({
      id: "member-1",
      email: "member@example.com",
      name: "member@example.com",
      role: "tribemate",
      avatarFallback: "M",
      image: null,
    });
  });

  it("returns null when there is no active session", async () => {
    const repository = new BetterAuthSessionRepository(async () => null);

    await expect(repository.getAuthenticatedMember()).resolves.toBeNull();
  });

  it("rethrows unexpected Better Auth session failures", async () => {
    const repository = new BetterAuthSessionRepository(async () => {
      throw new Error("Unexpected Better Auth failure");
    });

    await expect(repository.getAuthenticatedMember()).rejects.toThrow(
      "Unexpected Better Auth failure"
    );
  });
});
