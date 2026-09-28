import { vi, describe, it, expect } from "vitest";
import { PostgresTribeReadRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-read-repository";

describe("PostgresTribeReadRepository", () => {
  it("returns a visible tribe when the row is readable through RLS", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private",
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.findBySlug("matematica-pro")).resolves.toEqual({
      id: "tribe-1",
      name: "Matematica Pro",
      slug: "matematica-pro",
      visibility: "private",
    });
  });

  it("returns the current membership access through the diagnostic function that preserves blocked-member detection", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [{ status: "blocked" as const, status_reason: "payment_blocked" }],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessBySlug("matematica-pro")
    ).resolves.toEqual({
      // A blocked member never has community access.
      communityAccess: false,
      status: "blocked" as const,
      statusReason: "payment_blocked",
    });
  });

  it("returns the current membership access and readable tribe in one database query", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: "tribe-1",
          name: "Matematica Pro",
          community_access: true,
          slug: "matematica-pro",
          status: "active" as const,
          status_reason: "none",
          visibility: "private",
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessWithTribeBySlug("matematica-pro")
    ).resolves.toEqual({
      membershipAccess: {
        communityAccess: true,
        status: "active" as const,
        statusReason: "none",
      },
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
  });

  it("keeps the membership access when the tribe row is not readable", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          id: null,
          name: null,
          slug: null,
          status: "active" as const,
          status_reason: "none",
          visibility: null,
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.findCurrentMembershipAccessWithTribeBySlug("matematica-pro")
    ).resolves.toEqual({
      membershipAccess: {
        // Without a readable tribe row the boundary cannot be evaluated: closed.
        communityAccess: false,
        status: "active" as const,
        statusReason: "none",
      },
      tribe: null,
    });
  });

  it("lists visible membership tribes for the current member", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          tribe_id: "tribe-1",
          tribe_row_id: "tribe-1",
          membership_status: "active",
          name: "Alpha Club",
          role: "leader",
          slug: "alpha-club",
        },
        {
          tribe_id: "tribe-2",
          tribe_row_id: "tribe-2",
          membership_status: "muted",
          name: "Beta Club",
          role: "tribemate",
          slug: "beta-club",
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(repository.listVisibleMembershipTribes()).resolves.toEqual([
      {
        tribeId: "tribe-1",
        logoUrl: null,
        membershipStatus: "active",
        name: "Alpha Club",
        role: "leader",
        slug: "alpha-club",
      },
      {
        tribeId: "tribe-2",
        logoUrl: null,
        membershipStatus: "muted",
        name: "Beta Club",
        role: "tribemate",
        slug: "beta-club",
      },
    ]);
  });

  it("lists visible members for a readable tribe", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          email: "ada.lovelace@example.com",
          image: null,
          joined_free: false,
          member_id: "member-1",
          name: "Ada Lovelace",
          role: "leader",
        },
        {
          email: "grace.hopper@example.com",
          image: "https://example.com/grace.png",
          joined_free: true,
          member_id: "member-2",
          name: "Grace Hopper",
          role: "guardian",
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.listVisibleTribeMembersBySlug("matematica-pro")
    ).resolves.toEqual([
      {
        avatarFallback: "AL",
        email: "ada.lovelace@example.com",
        id: "member-1",
        image: null,
        joinedViaFreeInvitation: false,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-2",
        image: "https://example.com/grace.png",
        joinedViaFreeInvitation: true,
        name: "Grace Hopper",
        role: "guardian",
      },
    ]);
  });

  it("treats a missing free-invitation flag as not joined via a free invitation", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          email: null,
          image: null,
          joined_free: null,
          member_id: "member-1",
          name: "Ada Lovelace",
          role: "tribemate",
        },
      ],
    }); });

    const repository = new PostgresTribeReadRepository(async (callback) =>
      callback({
        execute,
      } as never)
    );

    await expect(
      repository.listVisibleTribeMembersBySlug("matematica-pro")
    ).resolves.toEqual([
      {
        avatarFallback: "AL",
        email: null,
        id: "member-1",
        image: null,
        joinedViaFreeInvitation: false,
        name: "Ada Lovelace",
        role: "tribemate",
      },
    ]);
  });
});
