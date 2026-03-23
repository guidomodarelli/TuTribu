import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect } from "next/navigation";

import SignInPage from "@/app/auth/signin/page";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

const signInMock = jest.fn();
const execute = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
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
    execute.mockReset();
    signInMock.mockReset();

    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute,
    });
  });

  it("redirects authenticated users to a safe callback path", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams("/calendar"),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/calendar");
  });

  it("redirects authenticated users to root when callback is missing", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams(),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects authenticated users to root when callback param is unsafe", async () => {
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

    await expect(
      SignInPage({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("starts Google sign-in with the default callback path", async () => {
    execute.mockResolvedValue(null);

    const user = userEvent.setup();

    render(
      await SignInPage({
        searchParams: createSearchParams(),
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    );

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });

  it("uses a safe callback path from search params", async () => {
    execute.mockResolvedValue(null);

    const user = userEvent.setup();

    render(
      await SignInPage({
        searchParams: createSearchParams("/calendar"),
      })
    );

    await user.click(screen.getByRole("button", { name: /iniciar sesion con google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/calendar",
    });
  });

  it("falls back to dashboard when callback param is unsafe", async () => {
    execute.mockResolvedValue(null);

    const user = userEvent.setup();

    render(
      await SignInPage({
        searchParams: createSearchParams("https://evil.example.com/callback"),
      })
    );

    await user.click(screen.getByRole("button", { name: /iniciar sesion con google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });
});
