import { listVisibleTribeMembers } from "@/src/modules/tribes/application/use-cases/list-visible-tribe-members-use-case";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

const memberFixtures: TribeMemberResult[] = [
  {
    avatarFallback: "KJ",
    email: "katherine.johnson@example.com",
    id: "member-3",
    image: null,
    joinedViaFreeInvitation: true,
    name: "Katherine Johnson",
    role: "tribemate",
  },
  {
    avatarFallback: "GH",
    email: "sofia.kovalevskaya@example.com",
    id: "member-2",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Sofia Kovalevskaya",
    role: "guardian",
  },
  {
    avatarFallback: "GH",
    email: "grace.hopper@example.com",
    id: "member-4",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Grace Hopper",
    role: "guardian",
  },
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
    avatarFallback: "AM",
    email: "ana.martinez@example.com",
    id: "member-5",
    image: null,
    joinedViaFreeInvitation: true,
    name: "Ana Martinez",
    role: "tribemate",
  },
  {
    avatarFallback: "AL",
    email: "duplicate.ada@example.com",
    id: "member-1",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Ada Lovelace",
    role: "leader",
  },
];

function buildExecutor() {
  const listVisibleTribeMembersBySlug = jest.fn(async () => memberFixtures);

  return {
    listVisibleTribeMembersBySlug,
    execute: listVisibleTribeMembers({
      tribeReadRepository: {
        findBySlug: jest.fn(),
        findCurrentMembershipAccessBySlug: jest.fn(),
        findCurrentMembershipAccessWithTribeBySlug: jest.fn(),
        findCurrentMembershipStatusBySlug: jest.fn(),
        listVisibleMembershipTribes: jest.fn(),
        listVisibleTribeMembersBySlug,
      },
    }),
  };
}

describe("listVisibleTribeMembers", () => {
  it("returns one visible member per user sorted by role and name when the viewer is a leader", async () => {
    const { execute, listVisibleTribeMembersBySlug } = buildExecutor();

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerCanViewFreeInvitations: true,
        viewerCanViewMemberEmails: true,
      })
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
        id: "member-4",
        image: null,
        joinedViaFreeInvitation: false,
        name: "Grace Hopper",
        role: "guardian",
      },
      {
        avatarFallback: "GH",
        email: "sofia.kovalevskaya@example.com",
        id: "member-2",
        image: null,
        joinedViaFreeInvitation: false,
        name: "Sofia Kovalevskaya",
        role: "guardian",
      },
      {
        avatarFallback: "AM",
        email: "ana.martinez@example.com",
        id: "member-5",
        image: null,
        joinedViaFreeInvitation: true,
        name: "Ana Martinez",
        role: "tribemate",
      },
      {
        avatarFallback: "KJ",
        email: "katherine.johnson@example.com",
        id: "member-3",
        image: null,
        joinedViaFreeInvitation: true,
        name: "Katherine Johnson",
        role: "tribemate",
      },
    ]);
    expect(listVisibleTribeMembersBySlug).toHaveBeenCalledWith("matematica-pro");
  });

  it("keeps emails visible when the viewer can view member emails", async () => {
    const { execute } = buildExecutor();

    const results = await execute({
      tribeSlug: "matematica-pro",
      viewerCanViewFreeInvitations: true,
      viewerCanViewMemberEmails: true,
    });

    expect(results.every((member) => member.email !== null)).toBe(true);
  });

  it("scrubs emails to null when the viewer cannot view member emails", async () => {
    const { execute } = buildExecutor();

    const results = await execute({
      tribeSlug: "matematica-pro",
      viewerCanViewFreeInvitations: false,
      viewerCanViewMemberEmails: false,
    });

    expect(results).toHaveLength(5);
    expect(results.every((member) => member.email === null)).toBe(true);
  });

  it("keeps the free-invitation flag when the viewer can view free invitations", async () => {
    const { execute } = buildExecutor();

    const results = await execute({
      tribeSlug: "matematica-pro",
      viewerCanViewFreeInvitations: true,
      viewerCanViewMemberEmails: true,
    });

    expect(
      results.filter((member) => member.joinedViaFreeInvitation).map((member) => member.id)
    ).toEqual(["member-5", "member-3"]);
  });

  it("scrubs the free-invitation flag to false when the viewer cannot view free invitations", async () => {
    const { execute } = buildExecutor();

    const results = await execute({
      tribeSlug: "matematica-pro",
      viewerCanViewFreeInvitations: false,
      viewerCanViewMemberEmails: true,
    });

    expect(results.every((member) => member.joinedViaFreeInvitation === false)).toBe(
      true
    );
  });

  it("preserves the role-based sort order even when emails are scrubbed", async () => {
    const { execute } = buildExecutor();

    const results = await execute({
      tribeSlug: "matematica-pro",
      viewerCanViewFreeInvitations: false,
      viewerCanViewMemberEmails: false,
    });

    expect(results.map((member) => member.id)).toEqual([
      "member-1",
      "member-4",
      "member-2",
      "member-5",
      "member-3",
    ]);
  });
});
