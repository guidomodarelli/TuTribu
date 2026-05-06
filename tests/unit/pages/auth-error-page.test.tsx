import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import AuthErrorPage from "@/app/auth/error/page";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/setup",
  () => ({
    createRequestModules: jest.fn(),
  })
);

describe("AuthErrorPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();

    (createRequestModules as jest.Mock).mockResolvedValue({
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
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(AuthErrorPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders authentication error content for unauthenticated users", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(await AuthErrorPage());

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
