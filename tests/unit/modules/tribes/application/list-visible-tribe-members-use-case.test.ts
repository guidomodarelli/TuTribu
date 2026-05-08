import { listVisibleTribeMembers } from "@/src/modules/tribes/application/use-cases/list-visible-tribe-members-use-case";

describe("listVisibleTribeMembers", () => {
  it("returns one visible member per user sorted by role and name", async () => {
    const listVisibleTribeMembersBySlug = jest.fn(async () => [
      {
        avatarFallback: "KJ",
        id: "member-3",
        image: null,
        name: "Katherine Johnson",
        role: "tribemate" as const,
      },
      {
        avatarFallback: "GH",
        id: "member-2",
        image: null,
        name: "Sofia Kovalevskaya",
        role: "guardian" as const,
      },
      {
        avatarFallback: "GH",
        id: "member-4",
        image: null,
        name: "Grace Hopper",
        role: "guardian" as const,
      },
      {
        avatarFallback: "AL",
        id: "member-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader" as const,
      },
      {
        avatarFallback: "AM",
        id: "member-5",
        image: null,
        name: "Ana Martinez",
        role: "tribemate" as const,
      },
      {
        avatarFallback: "AL",
        id: "member-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader" as const,
      },
    ]);
    const execute = listVisibleTribeMembers({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipAccessBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes: jest.fn(),
        listVisibleTribeMembersBySlug,
      },
    });

    await expect(execute({ tribeSlug: "matematica-pro" })).resolves.toEqual([
      {
        avatarFallback: "AL",
        id: "member-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        id: "member-4",
        image: null,
        name: "Grace Hopper",
        role: "guardian",
      },
      {
        avatarFallback: "GH",
        id: "member-2",
        image: null,
        name: "Sofia Kovalevskaya",
        role: "guardian",
      },
      {
        avatarFallback: "AM",
        id: "member-5",
        image: null,
        name: "Ana Martinez",
        role: "tribemate",
      },
      {
        avatarFallback: "KJ",
        id: "member-3",
        image: null,
        name: "Katherine Johnson",
        role: "tribemate",
      },
    ]);
    expect(listVisibleTribeMembersBySlug).toHaveBeenCalledWith("matematica-pro");
  });
});
