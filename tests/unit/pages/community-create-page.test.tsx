import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import CreateCommunityPage from "@/app/(platform)/comunidad/crear/page";
import { createRequestModules } from "@/src/modules/setup";
import { getContactEmail } from "@/src/modules/communities/infrastructure/config/community-creation-contact-email";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const getCommunityCreationEligibility = jest.fn();
const errorMock = jest.fn();

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/communities/infrastructure/config/community-creation-contact-email",
  () => ({
    getContactEmail: jest.fn(),
  })
);

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

describe("CreateCommunityPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getCommunityCreationEligibility.mockReset();
    errorMock.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      communities: {
        useCases: {
          getCommunityCreationEligibility,
        },
      },
    });
    (getContactEmail as jest.Mock).mockReturnValue(
      "comunidades@example.com"
    );
    (createServerLogger as jest.Mock).mockReturnValue({
      error: errorMock,
      info: jest.fn(),
    });
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

  it("logs session resolution failures when request modules cannot be created", async () => {
    (createRequestModules as jest.Mock).mockRejectedValue(
      new Error("module_setup_failed")
    );

    await expect(
      CreateCommunityPage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("module_setup_failed");

    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for community creation page",
      error: expect.any(Error),
    });
  });
});
