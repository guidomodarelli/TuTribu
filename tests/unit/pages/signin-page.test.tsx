import { render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";

import SignInPage from "@/app/auth/signin/page";
import { createAuthModule } from "@/src/modules/auth/setup";

const getAuthenticatedMember = jest.fn();
const navigateToGoogleAuthStartMock = jest.fn();

jest.mock("@/src/modules/auth/infrastructure/oauth/start-google-auth-navigation", () => ({
  navigateToGoogleAuthStart: (...args: unknown[]) =>
    navigateToGoogleAuthStartMock(...args),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/setup",
  () => ({
    createAuthModule: jest.fn(),
  })
);

type SignInSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function createSearchParams(
  callbackUrl?: string | string[]
): SignInSearchParams {
  return Promise.resolve(
    callbackUrl === undefined
      ? {}
      : {
          callbackUrl,
        }
  );
}

describe("SignInPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    navigateToGoogleAuthStartMock.mockReset();

    (createAuthModule as jest.Mock).mockReturnValue({
      useCases: {
        getAuthenticatedMember,
      },
    });
  });

  it("redirects authenticated users to a safe callback path", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams("/auth/error"),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/error");
  });

  it("redirects authenticated users to root when callback is missing", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams(),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects authenticated users to root when callback param is unsafe", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("starts Google sign-in automatically with the default callback path", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInPage({
        searchParams: createSearchParams(),
      })
    );

    await waitFor(() => {
      expect(navigateToGoogleAuthStartMock).toHaveBeenCalledWith("/");
    });

    expect(
      screen.getByText(/te estamos redirigiendo a google/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    ).toBeInTheDocument();
  });

  it("uses a safe callback path from search params in automatic sign-in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInPage({
        searchParams: createSearchParams("/auth/error"),
      })
    );

    await waitFor(() => {
      expect(navigateToGoogleAuthStartMock).toHaveBeenCalledWith("/auth/error");
    });
  });

  it("falls back to root when callback param is unsafe in automatic sign-in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInPage({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    );

    await waitFor(() => {
      expect(navigateToGoogleAuthStartMock).toHaveBeenCalledWith("/");
    });
  });
});
