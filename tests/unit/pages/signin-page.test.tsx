import { vi, describe, it, expect, beforeEach, afterAll, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { headers } from "next/headers";
import { redirect, useRouter } from "next/navigation";

import {
  SignInContent,
  SignInPendingView,
} from "@/app/auth/signin/sign-in-content";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const startGoogleSignInMock = vi.fn();
const pushMock = vi.fn();

const SAFARI_IOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const MERCADO_PAGO_IOS_WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MercadoPago/12.34.5";

vi.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignInMock(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock(
  "@/src/modules/setup",
  () => ({
    createRequestModules: vi.fn(),
  })
);

function mockUserAgentHeader(userAgent: string) {
  (headers as Mock).mockResolvedValue(
    new Headers({ "user-agent": userAgent })
  );
}

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
  const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockReset();
    startGoogleSignInMock.mockReset();
    pushMock.mockReset();
    startGoogleSignInMock.mockResolvedValue(undefined);

    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";

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
    (useRouter as Mock).mockReturnValue({
      push: pushMock,
    });
    mockUserAgentHeader(SAFARI_IOS_USER_AGENT);
  });

  afterAll(() => {
    if (originalBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
      return;
    }

    process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
  });

  it("redirects authenticated users to a safe callback path", async () => {
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

    await expect(
      SignInContent({
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
      role: "guardian",
      avatarFallback: "GH",
      image: null,
    });
    (redirect as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      SignInContent({
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
      role: "guardian",
      avatarFallback: "GH",
      image: null,
    });
    (redirect as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      SignInContent({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it.each([
    ["a backslash", "/\\evil.example.com/callback"],
    ["an encoded backslash", "/%5Cevil.example.com"],
    ["a tab between slashes", "/\t/evil.example.com"],
    ["a protocol-relative URL", "//evil.example.com"],
  ])(
    "redirects authenticated users to root when the callback hides an external host behind %s",
    async (_payloadDescription, callbackUrl) => {
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

      await expect(
        SignInContent({
          searchParams: createSearchParams(
            decodeURIComponent(callbackUrl)
          ),
        })
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith("/");
    }
  );

  it("keeps the query string of a safe callback path", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInContent({
        searchParams: createSearchParams(
          "/matematica-pro?preapproval_id=preapproval-1"
        ),
      })
    );

    await waitFor(() => {
      expect(startGoogleSignInMock).toHaveBeenCalledWith(
        "/matematica-pro?preapproval_id=preapproval-1"
      );
    });
  });

  it("starts Google sign-in automatically with the default callback path", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInContent({
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
        name: /iniciar sesión con google/i,
      })
    ).toBeInTheDocument();
  });

  it("renders the pending view without starting Google sign-in", () => {
    render(<SignInPendingView />);

    expect(
      screen.getByText(/preparando acceso/i)
    ).toBeInTheDocument();
    expect(startGoogleSignInMock).not.toHaveBeenCalled();
  });

  it("uses a safe callback path from search params in automatic sign-in", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(
      await SignInContent({
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
      await SignInContent({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    );

    await waitFor(() => {
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/");
    });
  });

  it("renders the open-in-browser CTA when the request comes from the Mercado Pago in-app browser", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    mockUserAgentHeader(MERCADO_PAGO_IOS_WEBVIEW_USER_AGENT);

    render(
      await SignInContent({
        searchParams: createSearchParams(
          "/matematica-pro?preapproval_id=preapproval-1"
        ),
      })
    );

    expect(
      screen.getByRole("heading", { name: "Abrí TuTribu en tu navegador" })
    ).toBeInTheDocument();
    const openInSafariLink = screen.getByRole("link", {
      name: "Abrir en Safari",
    });
    expect(openInSafariLink).toHaveAttribute(
      "href",
      "x-safari-https://tutribu.example.com/auth/signin?callbackUrl=%2Fmatematica-pro%3Fpreapproval_id%3Dpreapproval-1"
    );
    expect(startGoogleSignInMock).not.toHaveBeenCalled();
  });

  it("does not switch to the in-app CTA for regular Safari on iOS", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    mockUserAgentHeader(SAFARI_IOS_USER_AGENT);

    render(
      await SignInContent({
        searchParams: createSearchParams(),
      })
    );

    expect(
      screen.queryByRole("heading", { name: "Abrí TuTribu en tu navegador" })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/");
    });
  });
});
