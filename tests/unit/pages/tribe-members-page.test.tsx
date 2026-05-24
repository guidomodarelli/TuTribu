import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeTribePage from "@/app/(platform)/tribu/[slug]/tribu/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getMemberTribes = jest.fn();
const listVisibleTribeMembers = jest.fn();
const getTribeWelcome = jest.fn();
const listTribeWelcomeSelections = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

type MockTribeMemberDirectoryProps = {
  canInviteMembers: boolean;
  members: Array<{
    email: string;
    name: string;
    role: string;
  }>;
  selectionsByMemberId: Record<
    string,
    Array<{ count: number; id: string; label: string }>
  >;
  tribeSlug: string;
};

const mockTribeMemberDirectory = jest.fn(
  ({ canInviteMembers, members, tribeSlug }: MockTribeMemberDirectoryProps) => (
    <section>
      <h1>Miembros</h1>
      {canInviteMembers ? (
        <a href={`/tribu/${tribeSlug}/invitaciones`}>Invitar miembro</a>
      ) : null}
      {members.map((member) => (
        <article key={member.email}>
          <p>{member.name}</p>
          <p>{member.email}</p>
          {member.role === "leader" ? <p>Líder</p> : null}
          {member.role === "guardian" ? <p>Guardián</p> : null}
        </article>
      ))}
    </section>
  )
);

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock("@/components/tribes/tribe-member-directory", () => ({
  TribeMemberDirectory: (props: MockTribeMemberDirectoryProps) =>
    mockTribeMemberDirectory(props),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

describe("TribeTribePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribePageAccess.mockReset();
    listVisibleTribeMembers.mockReset();
    getTribeWelcome.mockReset();
    getTribeWelcome.mockResolvedValue({
      linksHeading: "Recursos para empezar",
      links: [],
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "",
    });
    listTribeWelcomeSelections.mockReset();
    listTribeWelcomeSelections.mockResolvedValue([]);
    getMemberTribes.mockReset();
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    mockTribeMemberDirectory.mockClear();
    infoMock.mockReset();
    errorMock.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getMemberTribes,
          getTribePageAccess,
          getTribeWelcome,
          listTribeWelcomeSelections,
          listVisibleTribeMembers,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      info: infoMock,
      error: errorMock,
    });
  });

  it("renders the visible tribe members with leader and guardian role pills", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "AL",
        email: "ada.lovelace@example.com",
        id: "member-2",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "guardian",
      },
      {
        avatarFallback: "KJ",
        email: "katherine.johnson@example.com",
        id: "member-3",
        image: null,
        name: "Katherine Johnson",
        role: "tribemate",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Miembros",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada.lovelace@example.com")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper@example.com")).toBeInTheDocument();
    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
    expect(screen.getByText("katherine.johnson@example.com")).toBeInTheDocument();
    expect(screen.getByText("Líder")).toBeInTheDocument();
    expect(screen.getByText("Guardián")).toBeInTheDocument();
    expect(screen.queryByText("Integrante")).not.toBeInTheDocument();
    expect(listVisibleTribeMembers).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns 404 when visible member loading fails", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    listVisibleTribeMembers.mockRejectedValue(new Error("Database exploded"));
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(errorMock).toHaveBeenCalledWith({
      error: expect.any(Error),
      message: "Failed to resolve tribe members",
      metadata: expect.objectContaining({
        reason: "unexpected_members_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });

  it("logs and renders without selection filters when welcome loading fails", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "tribemate",
      },
    ]);
    getTribeWelcome.mockRejectedValue(new Error("Missing welcome migration"));

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith({
      error: expect.any(Error),
      message: "Failed to resolve tribe welcome",
      metadata: expect.objectContaining({
        reason: "unexpected_welcome_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });

  it("logs and renders without selection badges when selection loading fails", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "tribemate",
      },
    ]);
    listTribeWelcomeSelections.mockRejectedValue(
      new Error("RLS policy unavailable")
    );

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith({
      error: expect.any(Error),
      message: "Failed to resolve tribe welcome selections",
      metadata: expect.objectContaining({
        reason: "unexpected_welcome_selections_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      }),
    });
  });

  it("filters hidden member selections before rendering the member directory", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "GH",
        email: "grace.hopper@example.com",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "tribemate",
      },
    ]);
    getTribeWelcome.mockResolvedValue({
      links: [
        {
          badgeLabel: "Soporte",
          id: "link-1",
          isActive: true,
          label: "Soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: "custom_button",
          url: "https://soporte.example.com",
        },
      ],
      rules: [],
      welcomeMessage: "Bienvenido/a",
    });
    listTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-1",
        welcomeLinkId: "link-1",
      },
      {
        selectedAt: new Date("2026-05-22T12:01:00.000Z"),
        userId: "hidden-member",
        welcomeLinkId: "link-1",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionsByMemberId: {
          "member-1": [{ count: 1, id: "link-1", label: "Soporte" }],
        },
      })
    );
  });

  it("aggregates repeated welcome accesses into a single badge with the access count", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "CM",
        email: "cami@example.com",
        id: "member-2",
        image: null,
        name: "Camila Morales",
        role: "tribemate",
      },
    ]);
    getTribeWelcome.mockResolvedValue({
      links: [
        {
          badgeLabel: "cambio_asesor_iol",
          id: "link-1",
          isActive: true,
          label: "Cambiar asesor en IOL",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: "custom_button",
          url: "https://iol.example.com",
        },
      ],
      rules: [],
      welcomeMessage: "Bienvenido/a",
    });
    listTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-2",
        welcomeLinkId: "link-1",
      },
      {
        selectedAt: new Date("2026-05-22T13:00:00.000Z"),
        userId: "member-2",
        welcomeLinkId: "link-1",
      },
      {
        selectedAt: new Date("2026-05-22T14:00:00.000Z"),
        userId: "member-2",
        welcomeLinkId: "link-1",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionsByMemberId: {
          "member-2": [
            { count: 3, id: "link-1", label: "cambio_asesor_iol" },
          ],
        },
      })
    );
  });

  it.each([
    ["leader" as const],
    ["guardian" as const],
  ])(
    "passes canInviteMembers true when the viewer is %s of this tribe",
    async (role) => {
      getAuthenticatedMember.mockResolvedValue({
        avatarFallback: "GH",
        email: "leader@example.com",
        id: "member-1",
        image: null,
        name: "Grace Hopper",
        role: "tribemate",
      });
      getTribePageAccess.mockResolvedValue({
        status: "visible",
        tribe: {
          id: "tribe-1",
          name: "Matematica Pro",
          slug: "matematica-pro",
          visibility: "private",
        },
      });
      getMemberTribes.mockResolvedValue([
        {
          membershipStatus: "active",
          name: "Matematica Pro",
          role,
          slug: "matematica-pro",
          tribeId: "tribe-1",
        },
      ]);
      listVisibleTribeMembers.mockResolvedValue([]);

      render(
        await TribeTribePage({
          params: Promise.resolve({
            slug: "matematica-pro",
          }),
        })
      );

      expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
        expect.objectContaining({
          canInviteMembers: true,
          tribeSlug: "matematica-pro",
        })
      );
      expect(
        screen.getByRole("link", { name: "Invitar miembro" })
      ).toHaveAttribute("href", "/tribu/matematica-pro/invitaciones");
    }
  );

  it("passes canInviteMembers false when the viewer is a tribemate", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        canInviteMembers: false,
      })
    );
    expect(
      screen.queryByRole("link", { name: "Invitar miembro" })
    ).not.toBeInTheDocument();
  });

  it("passes canInviteMembers false and hides manager-only filters when the viewer is a muted manager", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "muted",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "CM",
        email: "cami@example.com",
        id: "member-2",
        image: null,
        name: "Camila Morales",
        role: "tribemate",
      },
    ]);
    getTribeWelcome.mockResolvedValue({
      links: [
        {
          badgeLabel: "Soporte",
          id: "link-1",
          isActive: true,
          label: "Soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: "custom_button",
          url: "https://soporte.example.com",
        },
      ],
      rules: [],
      welcomeMessage: "Bienvenido/a",
    });
    listTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-2",
        welcomeLinkId: "link-1",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        canInviteMembers: false,
        filterOptions: [],
        selectionsByMemberId: {},
      })
    );
    expect(getTribeWelcome).not.toHaveBeenCalled();
    expect(listTribeWelcomeSelections).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "Invitar miembro" })
    ).not.toBeInTheDocument();
  });

  it("hides selection badges and filter options when the viewer is a tribemate", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listVisibleTribeMembers.mockResolvedValue([
      {
        avatarFallback: "CM",
        email: "cami@example.com",
        id: "member-2",
        image: null,
        name: "Camila Morales",
        role: "tribemate",
      },
    ]);
    getTribeWelcome.mockResolvedValue({
      links: [
        {
          badgeLabel: "Soporte",
          id: "link-1",
          isActive: true,
          label: "Soporte",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: "custom_button",
          url: "https://soporte.example.com",
        },
      ],
      rules: [],
      welcomeMessage: "Bienvenido/a",
    });
    listTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-2",
        welcomeLinkId: "link-1",
      },
    ]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        filterOptions: [],
        selectionsByMemberId: {},
      })
    );
    expect(getTribeWelcome).not.toHaveBeenCalled();
    expect(listTribeWelcomeSelections).not.toHaveBeenCalled();
  });

  it("passes canInviteMembers false when the viewer has no membership in this tribe", async () => {
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getMemberTribes.mockResolvedValue([]);
    listVisibleTribeMembers.mockResolvedValue([]);

    render(
      await TribeTribePage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(mockTribeMemberDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        canInviteMembers: false,
      })
    );
  });
});
