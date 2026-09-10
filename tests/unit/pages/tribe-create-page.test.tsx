import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import CreateTribePage from "@/app/(platform)/-/crear/page";
import { createRequestModules } from "@/src/modules/setup";
import { getContactEmail } from "@/src/modules/tribes/infrastructure/config/tribe-creation-contact-email";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribeCreationEligibility = vi.fn();
const errorMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/tribes/infrastructure/config/tribe-creation-contact-email",
  () => ({
    getContactEmail: vi.fn(),
  })
);

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

describe("CreateTribePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();
    getTribeCreationEligibility.mockReset();
    errorMock.mockReset();
    (headers as Mock).mockResolvedValue(new Headers());

    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getTribeCreationEligibility,
        },
      },
    });
    (getContactEmail as Mock).mockReturnValue(
      "tribus@example.com"
    );
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: vi.fn(),
    });
  });

  it("redirects unauthenticated users to sign in with a callback", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    (redirect as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      CreateTribePage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signin?callbackUrl=%2F-%2Fcrear");
  });

  it("renders the creation form for whitelisted users", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribeCreationEligibility.mockResolvedValue({
      canCreate: true,
    });

    render(
      await CreateTribePage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByRole("heading", { name: /crear una tribu/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre de la tribu/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });

  it("renders a blocked state with a contact email for users outside the whitelist", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "leader@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    getTribeCreationEligibility.mockResolvedValue({
      canCreate: false,
    });

    render(
      await CreateTribePage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByRole("heading", { name: /permiso para crear una tribu/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escribir a tribus@example.com/i })).toHaveAttribute(
      "href",
      "mailto:tribus@example.com"
    );
    expect(screen.queryByLabelText(/nombre de la tribu/i)).not.toBeInTheDocument();
  });

  it("logs session resolution failures when request modules cannot be created", async () => {
    (createRequestModules as Mock).mockRejectedValue(
      new Error("module_setup_failed")
    );

    await expect(
      CreateTribePage({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("module_setup_failed");

    expect(errorMock).toHaveBeenCalledWith({
      message: "Failed to resolve session for tribe creation page",
      error: expect.any(Error),
    });
  });
});
