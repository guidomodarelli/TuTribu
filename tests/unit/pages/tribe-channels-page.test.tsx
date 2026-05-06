import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeChannelsPage from "@/app/(platform)/tribu/[slug]/canales/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const listTribeChannels = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/tribe-round/tribe-channel-management", () => ({
  TribeChannelManagement: ({
    channels,
    tribeSlug,
  }: {
    channels: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestión de canales</h1>
      <p>{tribeSlug}</p>
      <p>{channels.length}</p>
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

const channel = {
  accessScope: "tribemates" as const,
  emoji: "🔥",
  id: "channel-ronda",
  name: "Ronda",
  slug: "ronda",
  sortOrder: 20,
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeChannelsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    listTribeChannels.mockResolvedValue({
      channels: [channel],
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
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
        },
      },
      messages: {
        useCases: {
          listTribeChannels,
        },
      },
    });
  });

  it("renders channel management for tribe leaders", async () => {
    render(await TribeChannelsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de canales" })).toBeInTheDocument();
    expect(listTribeChannels).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("renders channel management for tribe guardians", async () => {
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
      },
    ]);

    render(await TribeChannelsPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Gestión de canales" })).toBeInTheDocument();
    expect(listTribeChannels).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns 404 when a regular member opens the channel management URL", async () => {
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

    await expect(TribeChannelsPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribeChannels).not.toHaveBeenCalled();
  });

  it("returns 404 when an leader is muted", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    getMemberTribes.mockResolvedValue([
      {
        tribeId: "tribe-1",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeChannelsPage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(listTribeChannels).not.toHaveBeenCalled();
  });
});
