import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeInvitationsPage from "@/app/(platform)/tribu/[slug]/invitaciones/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const listTribeInvitations = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/tribes/tribe-invitation-management", () => ({
  TribeInvitationManagement: ({
    invitations,
    tribeSlug,
  }: {
    invitations: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de invitaciones</h1>
      <p>{tribeSlug}</p>
      <p>{invitations.length}</p>
    </section>
  ),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

const authenticatedMember = {
  avatarFallback: "GH",
  email: "leader@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeInvitationsPage", () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://canonical.tutribu.example.com";
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
      },
    ]);
    listTribeInvitations.mockResolvedValue([
      {
        createdAt: "2026-04-26T07:00:00.000Z",
        createdByName: "Grace Hopper",
        id: "invitation-1",
        invitationUrl: null,
      },
    ]);
    (headers as jest.Mock).mockResolvedValue(
      new Headers({
        host: "tutribu.example.com",
        "x-forwarded-proto": "https",
      })
    );
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: infoMock,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          listTribeInvitations,
        },
      },
    });
  });

  afterEach(() => {
    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  });

  it("renders invitation management for tribe leaders", async () => {
    render(await TribeInvitationsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de invitaciones" })).toBeInTheDocument();
    expect(listTribeInvitations).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("renders invitation management for tribe guardians", async () => {
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
      },
    ]);

    render(await TribeInvitationsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de invitaciones" })).toBeInTheDocument();
  });

  it("returns 404 when a regular member opens invitation management", async () => {
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeInvitationsPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribeInvitations).not.toHaveBeenCalled();
  });
});
