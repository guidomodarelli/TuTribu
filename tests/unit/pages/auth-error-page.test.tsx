import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import AuthErrorPage from "@/app/auth/error/page";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

const execute = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
  })
);

describe("AuthErrorPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute,
    });
  });

  it("redirects authenticated users to root", async () => {
    execute.mockResolvedValue({
      id: "member-1",
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
    execute.mockResolvedValue(null);

    render(await AuthErrorPage());

    expect(screen.getByText(/authentication error/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /we could not complete google sign-in/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to sign-in/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
  });
});
