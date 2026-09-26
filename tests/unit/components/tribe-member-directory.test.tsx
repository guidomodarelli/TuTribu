import { vi, describe, it, expect, beforeEach, type MockedFunction } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeMemberDirectory } from "@/components/tribes/tribe-member-directory";
import { downloadTextFile } from "@/components/tribes/tribe-member-directory/export";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

vi.mock("@/components/tribes/tribe-member-directory/export", async () => {
  const actual = await vi.importActual<typeof import("@/components/tribes/tribe-member-directory/export")>(
    "@/components/tribes/tribe-member-directory/export"
  );

  return {
    ...actual,
    downloadTextFile: vi.fn(),
  };
});

const downloadTextFileMock = downloadTextFile as MockedFunction<
  typeof downloadTextFile
>;

beforeEach(() => {
  downloadTextFileMock.mockClear();
});

const baseMembers: TribeMemberResult[] = [
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
    image: null,
    joinedViaFreeInvitation: true,
    name: "Grace Hopper",
    role: "tribemate",
  },
  {
    avatarFallback: "KJ",
    email: "katherine.j@example.com",
    id: "member-3",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Katherine Johnson",
    role: "tribemate",
  },
];

describe("TribeMemberDirectory", () => {
  it("renders every member when there is no search query and no filter", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
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

  it("numbers each rendered member by its position in the list", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    const memberList = screen.getByRole("list", { name: "Lista de miembros" });
    const items = within(memberList).getAllByRole("listitem");

    expect(within(items[0]).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(items[0]).getByText("1")).toBeInTheDocument();
    expect(within(items[1]).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(items[1]).getByText("2")).toBeInTheDocument();
    expect(within(items[2]).getByText("Katherine Johnson")).toBeInTheDocument();
    expect(within(items[2]).getByText("3")).toBeInTheDocument();
  });

  it("renumbers members from one when a filter narrows the list", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        canViewFreeInvitations={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Invitación free (1)" })
    );

    const memberList = screen.getByRole("list", { name: "Lista de miembros" });

    await waitFor(() => {
      expect(within(memberList).getAllByRole("listitem")).toHaveLength(1);
    });

    const items = within(memberList).getAllByRole("listitem");

    expect(within(items[0]).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(items[0]).getByText("1")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
  });

  it("filters members by a case-insensitive name match", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
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
    await waitFor(() => expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument());
  });

  it("filters members by an email substring", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
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
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
  });

  it("shows the empty list copy when no member matches the search", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
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

    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument());
  });

  it("composes the search query with the active selection filter", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
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

    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument());
  });

  it("falls back to every member when the active filter is no longer available", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TribeMemberDirectory
        canExportMembers={false}
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
    await waitFor(() => expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument());

    rerender(
      <TribeMemberDirectory
        canExportMembers={false}
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

  it("hides the export trigger when the viewer cannot export members", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.queryByRole("button", { name: "Exportar" })
    ).not.toBeInTheDocument();
  });

  it("triggers a CSV download with the filtered members when exporting to CSV", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={true}
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
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    await user.click(screen.getByRole("menuitem", { name: "Exportar a CSV" }));

    expect(downloadTextFileMock).toHaveBeenCalledTimes(1);
    const [csvContent, csvFilename, csvMimeType] =
      downloadTextFileMock.mock.calls[0] ?? [];

    expect(csvContent).toContain("Ada Lovelace");
    expect(csvContent).not.toContain("Grace Hopper");
    expect(csvFilename).toMatch(/^miembros-matematica-pro-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csvMimeType).toContain("text/csv");
  });

  it("triggers an HTML download with every member when exporting to HTML", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={true}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("button", { name: "Exportar" }));
    await user.click(screen.getByRole("menuitem", { name: "Exportar a HTML" }));

    expect(downloadTextFileMock).toHaveBeenCalledTimes(1);
    const [htmlContent, htmlFilename, htmlMimeType] =
      downloadTextFileMock.mock.calls[0] ?? [];

    expect(htmlContent).toContain("<table>");
    expect(htmlContent).toContain("Ada Lovelace");
    expect(htmlContent).toContain("Grace Hopper");
    expect(htmlContent).toContain("Katherine Johnson");
    expect(htmlFilename).toMatch(/^miembros-matematica-pro-\d{4}-\d{2}-\d{2}\.html$/);
    expect(htmlMimeType).toContain("text/html");
  });

  it("hides email rows and swaps the search placeholder when no member has a visible email", async () => {
    const user = userEvent.setup();
    const membersWithoutEmail: TribeMemberResult[] = baseMembers.map((member) => ({
      ...member,
      email: null,
    }));

    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={membersWithoutEmail}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.queryByText("ada.lovelace@example.com")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("grace.hopper@example.com")
    ).not.toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", {
      name: "Buscar miembro",
    });

    expect(searchInput).toHaveAttribute("placeholder", "Buscar por nombre");

    await user.type(searchInput, "hopper");

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());

    await user.clear(searchInput);
    await user.type(searchInput, "ada.lovelace");

    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument());
  });

  it("keeps the email-aware search placeholder when at least one member email is visible", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("searchbox", { name: "Buscar miembro" })
    ).toHaveAttribute("placeholder", "Buscar por nombre o email");
  });

  it("does not show the free-invitation frame or chip when the viewer cannot view free invitations", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.queryByRole("button", { name: /Invitación free/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Invitación free")).not.toBeInTheDocument();
    expect(screen.queryByText("FREE")).not.toBeInTheDocument();
  });

  it("frames the avatar of members who joined for free when the viewer can view free invitations", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        canViewFreeInvitations={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByLabelText("Invitación free")).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
  });

  it("filters to only the members who joined through a free invitation", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        canViewFreeInvitations={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Invitación free (1)" })
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Katherine Johnson")).not.toBeInTheDocument());
  });

  it("renders the invite CTA only when the viewer can invite", () => {
    const { rerender } = render(
      <TribeMemberDirectory
        canExportMembers={false}
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
        canExportMembers={false}
        canInviteMembers={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("link", { name: "Invitar miembro" })
    ).toHaveAttribute("href", "/matematica-pro/invitaciones");
  });

  it("matches names regardless of accents typed in the search", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={[
          ...baseMembers,
          {
            avatarFallback: "JP",
            email: null,
            id: "member-4",
            image: null,
            joinedViaFreeInvitation: false,
            name: "José Pérez",
            role: "tribemate",
          },
        ]}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "jose perez"
    );

    expect(screen.getByText("José Pérez")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument()
    );
  });

  it("marks the active filter as pressed for assistive technology", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        canViewFreeInvitations={true}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    const allFilter = screen.getByRole("button", { name: "Todos (3)" });
    const freeFilter = screen.getByRole("button", { name: "Invitación free (1)" });

    expect(allFilter).toHaveAttribute("aria-pressed", "true");
    expect(freeFilter).toHaveAttribute("aria-pressed", "false");

    await user.click(freeFilter);

    expect(allFilter).toHaveAttribute("aria-pressed", "false");
    expect(freeFilter).toHaveAttribute("aria-pressed", "true");
  });

  it("explains that nothing matches and disables the export when the search hides every member", async () => {
    const user = userEvent.setup();
    render(
      <TribeMemberDirectory
        canExportMembers={true}
        canInviteMembers={false}
        filterOptions={[]}
        members={baseMembers}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByRole("button", { name: /Exportar/ })).toBeEnabled();

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar miembro" }),
      "nadie coincide"
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ningún miembro coincide con la búsqueda o el filtro elegido."
    );
    expect(
      screen.queryByText("Todavía no hay miembros visibles en esta tribu.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeDisabled();
  });

  it("keeps the tribe empty copy when there are no members at all", () => {
    render(
      <TribeMemberDirectory
        canExportMembers={false}
        canInviteMembers={false}
        filterOptions={[]}
        members={[]}
        selectionsByMemberId={{}}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Todavía no hay miembros visibles en esta tribu."
    );
  });
});
