import type { Session } from "next-auth";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/src/modules/auth/infrastructure/next-auth/auth-options", () => ({
  authOptions: {},
}));

import { NextAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/next-auth-session-repository";

describe("NextAuthSessionRepository", () => {
  it("maps an authenticated session user into a member", async () => {
    const resolveSession = jest.fn<Promise<Session | null>, []>(async () => ({
      user: {
        email: "member@example.com",
        image: "https://example.com/avatar.png",
        name: "Academia Member",
      },
      expires: "2099-01-01T00:00:00.000Z",
    }));

    const repository = new NextAuthSessionRepository(resolveSession);

    const result = await repository.getAuthenticatedMember();

    expect(result).toEqual({
      id: "member@example.com",
      email: "member@example.com",
      name: "Academia Member",
      role: "member",
      avatarFallback: "AM",
      image: "https://example.com/avatar.png",
    });
  });

  it("returns null when session has no user", async () => {
    const resolveSession = jest.fn<Promise<Session | null>, []>(async () => ({
      expires: "2099-01-01T00:00:00.000Z",
    }));

    const repository = new NextAuthSessionRepository(resolveSession);

    await expect(repository.getAuthenticatedMember()).resolves.toBeNull();
  });

  it("returns null when NextAuth fails to decrypt JWT session", async () => {
    const resolveSession = jest.fn<Promise<Session | null>, []>(async () => {
      throw new Error(
        '[next-auth][error][JWT_SESSION_ERROR] "decryption operation failed"'
      );
    });

    const repository = new NextAuthSessionRepository(resolveSession);

    await expect(repository.getAuthenticatedMember()).resolves.toBeNull();
  });

  it("rethrows unexpected session resolver failures", async () => {
    const resolverError = new Error("Unexpected auth provider failure");
    const resolveSession = jest.fn<Promise<Session | null>, []>(async () => {
      throw resolverError;
    });

    const repository = new NextAuthSessionRepository(resolveSession);

    await expect(repository.getAuthenticatedMember()).rejects.toThrow(
      "Unexpected auth provider failure"
    );
  });
});
