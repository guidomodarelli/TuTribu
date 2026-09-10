import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import { AuthErrorContent } from "@/app/auth/error/auth-error-content";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock(
  "@/src/modules/setup",
  () => ({
    createRequestModules: vi.fn(),
  })
);

describe("AuthErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();

    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {},
      },
    });
  });

  it("redirects authenticated users to root", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "guardian",
      avatarFallback: "GH",
      image: null,
    });
    (redirect as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(AuthErrorContent()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders authentication error content for unauthenticated users", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(await AuthErrorContent());

    expect(screen.getByText(/error de autenticacion/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /no pudimos completar el acceso con google/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver a iniciar sesion/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
  });
});
