import { render, screen, waitFor } from "@testing-library/react";
import { redirect, useRouter } from "next/navigation";

import SignInPage from "@/app/auth/signin/page";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const startGoogleSignInMock = jest.fn();
const pushMock = jest.fn();

jest.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignInMock(...args),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock(
  "@/src/modules/setup",
  () => ({
    createRequestModules: jest.fn(),
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
    startGoogleSignInMock.mockReset();
    pushMock.mockReset();
    startGoogleSignInMock.mockResolvedValue(undefined);

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
    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
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
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/");
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
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/auth/error");
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
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/");
    });
  });
});
