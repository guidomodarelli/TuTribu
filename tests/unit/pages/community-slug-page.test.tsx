import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";

import CommunityPage from "@/app/(platform)/comunidad/[slug]/page";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import { createGetCommunityPageAccessUseCase } from "@/src/modules/communities/infrastructure/composition/create-get-community-page-access-use-case";

const getAuthenticatedMember = jest.fn();
const getCommunityPageAccess = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
  })
);

jest.mock(
  "@/src/modules/communities/infrastructure/composition/create-get-community-page-access-use-case",
  () => ({
    createGetCommunityPageAccessUseCase: jest.fn(),
  })
);

describe("CommunityPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getCommunityPageAccess.mockReset();
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute: getAuthenticatedMember,
    });
    (createGetCommunityPageAccessUseCase as jest.Mock).mockReturnValue({
      execute: getCommunityPageAccess,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the private community view", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "visible",
      community: {
        id: "community-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });

    render(
      await CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    );

    expect(screen.getByRole("heading", { name: /matematica pro/i })).toBeInTheDocument();
    expect(screen.getByText(/comunidad privada/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /la comunidad ya existe y este espacio sera la base para sumar configuracion, miembros y contenido/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/\/comunidad\/matematica-pro/i)).toBeInTheDocument();
  });

  it("returns 404 and logs unauthenticated hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "unauthenticated_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      "[communities] hidden community access",
      expect.objectContaining({
        reason: "unauthenticated_hidden",
        slug: "matematica-pro",
        viewerId: null,
      })
    );
  });

  it("returns 404 and logs blocked hidden access", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "blocked@example.com",
      name: "Blocked User",
      role: "member",
      avatarFallback: "BU",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "blocked_hidden",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(console.info).toHaveBeenCalledWith(
      "[communities] hidden community access",
      expect.objectContaining({
        reason: "blocked_hidden",
        slug: "matematica-pro",
        viewerId: "member-1",
      })
    );
  });

  it("returns 404 and logs generic hidden access when the slug is not visible", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockResolvedValue({
      status: "hidden",
      reason: "not_found_or_not_visible",
    });
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "missing-community",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(console.info).toHaveBeenCalledWith(
      "[communities] hidden community access",
      expect.objectContaining({
        reason: "not_found_or_not_visible",
        slug: "missing-community",
        viewerId: "member-1",
      })
    );
  });

  it("returns 404 and logs unexpected repository failures", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityPageAccess.mockRejectedValue(new Error("Supabase exploded"));
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      CommunityPage({
        params: Promise.resolve({
          slug: "matematica-pro",
        }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(console.error).toHaveBeenCalledWith(
      "[communities] failed to resolve community access",
      expect.objectContaining({
        reason: "unexpected_repository_error",
        slug: "matematica-pro",
        viewerId: "member-1",
      })
    );
  });
});
