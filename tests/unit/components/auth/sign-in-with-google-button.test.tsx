import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { SignInWithGoogleButton } from "@/components/auth/sign-in-with-google-button";

const startGoogleSignInMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignInMock(...args),
}));

describe("SignInWithGoogleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startGoogleSignInMock.mockReset();
    pushMock.mockReset();
    startGoogleSignInMock.mockResolvedValue(undefined);
    (useRouter as Mock).mockReturnValue({
      push: pushMock,
    });
  });

  it("starts Google sign-in with the provided callback URL", async () => {
    const user = userEvent.setup();

    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesión con google/i,
      })
    );

    expect(startGoogleSignInMock).toHaveBeenCalledWith("/-/crear");
  });

  it("redirects to the auth error page when Better Auth rejects the OAuth start", async () => {
    const user = userEvent.setup();
    startGoogleSignInMock.mockRejectedValue(new Error("origin_mismatch"));

    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesión con google/i,
      })
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/error");
    });
  });

  it("disables the button while redirecting so repeated taps start a single OAuth flow", async () => {
    const user = userEvent.setup();
    startGoogleSignInMock.mockReturnValue(new Promise(() => undefined));
    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    const button = screen.getByRole("button", { name: /iniciar sesión con google/i });

    await user.click(button);
    await user.click(button);

    expect(startGoogleSignInMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(button).toHaveAccessibleName("Redirigiendo a Google…"));
  });

  it("enables the button again when the OAuth start fails", async () => {
    const user = userEvent.setup();
    startGoogleSignInMock.mockRejectedValue(new Error("origin_mismatch"));
    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    const button = screen.getByRole("button", { name: /iniciar sesión con google/i });

    await user.click(button);

    await waitFor(() => expect(button).toBeEnabled());
    await waitFor(() => expect(button).toHaveAccessibleName("Iniciar sesión con Google"));
  });

  it("enables the button again when the page returns from the back-forward cache", async () => {
    const user = userEvent.setup();
    startGoogleSignInMock.mockReturnValue(new Promise(() => undefined));
    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    const button = screen.getByRole("button", { name: /iniciar sesión con google/i });

    await user.click(button);
    expect(button).toBeDisabled();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(button).toBeEnabled();
    await user.click(button);
    expect(startGoogleSignInMock).toHaveBeenCalledTimes(2);
  });
});
