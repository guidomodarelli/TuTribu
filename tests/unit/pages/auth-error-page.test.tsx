import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import AuthErrorPage from "@/app/auth/error/page";
import { createAuthModule } from "@/src/modules/auth/setup";

const getAuthenticatedMember = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/setup",
  () => ({
    createAuthModule: jest.fn(),
  })
);

describe("AuthErrorPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();

    (createAuthModule as jest.Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
    });
  });

  it("redirects authenticated users to root", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "admin",
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
