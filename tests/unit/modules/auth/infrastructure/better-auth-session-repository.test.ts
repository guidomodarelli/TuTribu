import { BetterAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/better-auth-session-repository";

describe("BetterAuthSessionRepository", () => {
  it("maps the Better Auth session into an authenticated member", async () => {
    const repository = new BetterAuthSessionRepository(async () => ({
      session: {
        id: "session-1",
        userId: "member-1",
      },
      user: {
        id: "member-1",
        email: "member@example.com",
        image: "https://example.com/avatar.png",
        name: "Academia Member",
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toEqual({
      id: "member-1",
      email: "member@example.com",
      name: "Academia Member",
      role: "member",
      avatarFallback: "AM",
      image: "https://example.com/avatar.png",
    });
  });

  it("falls back to the email when the name is missing", async () => {
    const repository = new BetterAuthSessionRepository(async () => ({
      session: {
        id: "session-1",
        userId: "member-1",
      },
      user: {
        id: "member-1",
        email: "member@example.com",
        image: null,
        name: null,
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toEqual({
      id: "member-1",
      email: "member@example.com",
      name: "member@example.com",
      role: "member",
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
