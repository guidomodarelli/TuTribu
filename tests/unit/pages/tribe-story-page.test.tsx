import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeHistoryPage from "@/app/(platform)/[slug]/historia/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const getTribeStory = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
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

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

const authenticatedMember = {
  avatarFallback: "GH",
  email: "leader@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeHistoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribePageAccess,
          getTribeStory,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeStory.mockResolvedValue({
      content: "Nacimos en 2020.",
    });
  });

  it("renders the story as read-only for tribemates", async () => {
    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Historia" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nacimos en 2020.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar" })
    ).not.toBeInTheDocument();
    expect(getTribeStory).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("renders the editor for the active leader", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeHistoryPage(buildPageProps()));

    expect(
      screen.getByLabelText("Historia de la tribu")
    ).toHaveValue("Nacimos en 2020.");
    expect(
      screen.getByRole("button", { name: "Guardar" })
    ).toBeInTheDocument();
  });

  it("returns 404 when the viewer is not a member", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue(null);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeHistoryPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeStory).not.toHaveBeenCalled();
  });
});
