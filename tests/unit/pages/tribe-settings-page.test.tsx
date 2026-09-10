import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeSettingsPage from "@/app/(platform)/[slug]/ajustes/page";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const getTribeIdentity = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

function buildPageProps() {
  return {
    params: Promise.resolve({ slug: "matematica-pro" }),
  };
}

describe("TribeSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createRequestModules as Mock).mockResolvedValue({
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
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
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
      status: "visible" as const,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
        name: "Matematica Pro",
        role: "guardian",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSettingsPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(getTribeIdentity).not.toHaveBeenCalled();
  });

  it("returns 404 when the membership is not active", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeSettingsPage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
