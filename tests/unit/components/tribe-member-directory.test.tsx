import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeMemberDirectory } from "@/components/tribes/tribe-member-directory";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

const baseMembers: TribeMemberResult[] = [
  {
    avatarFallback: "AL",
    email: "ada.lovelace@example.com",
    id: "member-1",
    image: null,
    name: "Ada Lovelace",
    role: "leader",
  },
  {
    avatarFallback: "GH",
    email: "grace.hopper@example.com",
    id: "member-2",
    image: null,
    name: "Grace Hopper",
    role: "tribemate",
  },
  {
    avatarFallback: "KJ",
    email: "katherine.j@example.com",
    id: "member-3",
    image: null,
    name: "Katherine Johnson",
    role: "tribemate",
  },
];

describe("TribeMemberDirectory", () => {
  it("renders every member when there is no search query and no filter", () => {
    render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
  });

  it("filters members by a case-insensitive name match", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "ada"
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument();
  });

  it("filters members by an email substring", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "hopper"
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("shows the empty list copy when no member matches the search", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "nadie coincide aquí"
    );

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument();
  });

  it("composes the search query with the active selection filter", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[{ id: "link-1", label: "Soporte" }]}
        members={baseMembers}
        selectionsByMemberId={{
          "member-1": [{ count: 1, id: "link-1", label: "Soporte" }],
          "member-2": [{ count: 2, id: "link-1", label: "Soporte" }],
        }}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Soporte (2)" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "grace"
    );

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument();
  });

  it("falls back to every member when the active filter is no longer available", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[{ id: "link-1", label: "Soporte" }]}
        members={baseMembers}
        selectionsByMemberId={{
          "member-1": [{ count: 1, id: "link-1", label: "Soporte" }],
        }}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Soporte (1)" }));

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();

    rerender(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[{ id: "link-2", label: "Mentoría" }]}
        members={baseMembers}
        selectionsByMemberId={{
          "member-2": [{ count: 1, id: "link-2", label: "Mentoría" }],
        }}
        tribeSlug="matematica-avanzada"
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todos (3)" })).toBeInTheDocument();
  });

  it("renders the invite CTA only when the viewer can invite", () => {
    const { rerender } = render(
      <TribeMemberDirectory
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.queryByRole("link", { name: "Invitar miembro" })
    ).not.toBeInTheDocument();

    rerender(
      <TribeMemberDirectory
        canInviteMembers={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("link", { name: "Invitar miembro" })
    ).toHaveAttribute("href", "/tribu/matematica-pro/invitaciones");
  });
});
