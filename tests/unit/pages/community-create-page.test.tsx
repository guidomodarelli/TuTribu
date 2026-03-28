import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import CreateCommunityPage from "@/app/(platform)/comunidad/crear/page";
import { createAuthModule } from "@/src/modules/auth/setup";
import { createCommunitiesModule } from "@/src/modules/communities/setup";
import { getContactEmail } from "@/src/modules/communities/infrastructure/config/community-creation-contact-email";

const getAuthenticatedMember = jest.fn();
const getCommunityCreationEligibility = jest.fn();

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/src/modules/auth/setup", () => ({
  createAuthModule: jest.fn(),
}));

jest.mock("@/src/modules/communities/setup", () => ({
  createCommunitiesModule: jest.fn(),
}));

jest.mock(
  "@/src/modules/communities/infrastructure/config/community-creation-contact-email",
  () => ({
    getContactEmail: jest.fn(),
  })
);

describe("CreateCommunityPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getCommunityCreationEligibility.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createAuthModule as jest.Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
    });
    (createCommunitiesModule as jest.Mock).mockReturnValue({
      useCases: {
        getCommunityCreationEligibility,
      },
    });
    (getContactEmail as jest.Mock).mockReturnValue(
      "comunidades@example.com"
    );
  });

  it("redirects unauthenticated users to sign in with a callback", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      CreateCommunityPage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signin?callbackUrl=%2Fcomunidad%2Fcrear");
  });

  it("renders the creation form for whitelisted users", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityCreationEligibility.mockResolvedValue({
      canCreate: true,
    });

    render(
      await CreateCommunityPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByRole("heading", { name: /crear una comunidad/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre de la comunidad/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });

  it("renders a blocked state with a contact email for users outside the whitelist", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "owner@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    getCommunityCreationEligibility.mockResolvedValue({
      canCreate: false,
    });

    render(
      await CreateCommunityPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByText(/todavia no tienes permiso para crear una comunidad/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escribir a comunidades@example.com/i })).toHaveAttribute(
      "href",
      "mailto:comunidades@example.com"
    );
    expect(screen.queryByLabelText(/nombre de la comunidad/i)).not.toBeInTheDocument();
  });
});
