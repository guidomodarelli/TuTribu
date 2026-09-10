import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";

const startGoogleSignInMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignInMock(...args),
}));

describe("AutoSignInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startGoogleSignInMock.mockReset();
    pushMock.mockReset();
    startGoogleSignInMock.mockResolvedValue(undefined);
    (useRouter as Mock).mockReturnValue({
      push: pushMock,
    });
  });

  it("starts Google sign-in when the component mounts", async () => {
    render(<AutoSignInWithGoogle callbackUrl="/" />);

    await waitFor(() => {
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/");
    });

    expect(screen.getByText(/te estamos redirigiendo a google/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    ).toBeInTheDocument();
  });

  it("keeps a manual fallback button for retry", async () => {
    const user = userEvent.setup();

    render(<AutoSignInWithGoogle callbackUrl="/auth/error" />);

    await waitFor(() => {
      expect(startGoogleSignInMock).toHaveBeenCalledWith("/auth/error");
    });

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    );

    expect(startGoogleSignInMock).toHaveBeenCalledTimes(2);
    expect(startGoogleSignInMock).toHaveBeenLastCalledWith("/auth/error");
  });

  it("redirects to the auth error page when Better Auth rejects the OAuth start", async () => {
    startGoogleSignInMock.mockRejectedValue(new Error("origin_mismatch"));

    render(<AutoSignInWithGoogle callbackUrl="/" />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/error");
    });
  });
});
