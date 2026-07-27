import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeSettingsPage from "@/app/(platform)/[slug]/ajustes/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const getTribeIdentity = jest.fn();

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

function buildPageProps() {
  return {
    params: Promise.resolve({ slug: "matematica-pro" }),
  };
}

describe("TribeSettingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribeIdentity,
          getTribePageAccess,
        },
      },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
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
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeIdentity.mockResolvedValue({
      coverUrl: null,
      logoUrl: "https://images.example.com/logo.png",
    });
  });

  it("renders the identity editor for the leader", async () => {
    render(await TribeSettingsPage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Ajustes" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Logo")).toHaveValue(
      "https://images.example.com/logo.png"
    );
    expect(screen.getByLabelText("Portada")).toHaveValue("");
    expect(getTribeIdentity).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns 404 for a guardian", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSettingsPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeIdentity).not.toHaveBeenCalled();
  });

  it("returns 404 when the membership is not active", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSettingsPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
