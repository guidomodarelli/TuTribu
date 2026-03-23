import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SignInPage from "@/app/auth/signin/page";

const signInMock = jest.fn();
const getSearchParamMock = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => getSearchParamMock(key),
  }),
}));

describe("SignInPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    getSearchParamMock.mockReset();
  });

  it("starts Google sign-in with the default callback path", async () => {
    getSearchParamMock.mockReturnValue(null);

    const user = userEvent.setup();

    render(<SignInPage />);

    await user.click(
      screen.getByRole("button", {
        name: /sign in with google/i,
      })
    );

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });

  it("uses a safe callback path from search params", async () => {
    getSearchParamMock.mockImplementation((key: string) => {
      if (key === "callbackUrl") {
        return "/calendar";
      }

      return null;
    });

    const user = userEvent.setup();

    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/calendar",
    });
  });

  it("falls back to dashboard when callback param is unsafe", async () => {
    getSearchParamMock.mockImplementation((key: string) => {
      if (key === "callbackUrl") {
        return "https://evil.example.com/callback";
      }

      return null;
    });

    const user = userEvent.setup();

    render(<SignInPage />);

    await user.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });
});
