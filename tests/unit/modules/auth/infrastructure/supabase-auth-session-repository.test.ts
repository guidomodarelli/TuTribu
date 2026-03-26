import type { User } from "@supabase/supabase-js";

import { SupabaseAuthSessionRepository } from "@/src/modules/auth/infrastructure/repositories/supabase-auth-session-repository";

function createSupabaseUser(overrides: Partial<User> = {}): User {
  return {
    app_metadata: {
      provider: "google",
      providers: ["google"],
    },
    aud: "authenticated",
    created_at: "2026-03-25T00:00:00.000Z",
    id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
    role: "authenticated",
    updated_at: "2026-03-25T00:00:00.000Z",
    user_metadata: {},
    ...overrides,
  };
}

describe("SupabaseAuthSessionRepository", () => {
  it("maps a Supabase user into an authenticated member", async () => {
    const getUser = jest.fn(async () => ({
      data: {
        user: createSupabaseUser({
          email: "member@example.com",
          user_metadata: {
            avatar_url: "https://example.com/avatar.png",
            full_name: "Academia Member",
          },
        }),
      },
      error: null,
    }));

    const repository = new SupabaseAuthSessionRepository(async () => ({
      auth: {
        getUser,
      },
    }));

    const result = await repository.getAuthenticatedMember();

    expect(result).toEqual({
      id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
      email: "member@example.com",
      name: "Academia Member",
      role: "member",
      avatarFallback: "AM",
      image: "https://example.com/avatar.png",
    });
  });

  it("falls back to the email when the full name is missing", async () => {
    const repository = new SupabaseAuthSessionRepository(async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: createSupabaseUser({
              email: "member@example.com",
              user_metadata: {},
            }),
          },
          error: null,
        }),
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toEqual({
      id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
      email: "member@example.com",
      name: "member@example.com",
      role: "member",
      avatarFallback: "M",
      image: null,
    });
  });

  it("returns null when Supabase does not have an authenticated user", async () => {
    const repository = new SupabaseAuthSessionRepository(async () => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toBeNull();
  });

  it("returns null when Supabase reports a missing auth session", async () => {
    const repository = new SupabaseAuthSessionRepository(async () => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: {
            message: "Auth session missing!",
            name: "AuthSessionMissingError",
          },
        }),
      },
    }));

    await expect(repository.getAuthenticatedMember()).resolves.toBeNull();
  });

  it("rethrows unexpected Supabase auth failures", async () => {
    const repository = new SupabaseAuthSessionRepository(async () => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: {
            message: "Unexpected auth provider failure",
            name: "AuthApiError",
          },
        }),
      },
    }));

    await expect(repository.getAuthenticatedMember()).rejects.toThrow(
      "Unexpected auth provider failure"
    );
  });
});
