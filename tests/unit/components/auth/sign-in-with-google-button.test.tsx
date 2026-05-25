import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { SignInWithGoogleButton } from "@/components/auth/sign-in-with-google-button";

const startGoogleSignInMock = jest.fn();
const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignInMock(...args),
}));

describe("SignInWithGoogleButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startGoogleSignInMock.mockReset();
    pushMock.mockReset();
    startGoogleSignInMock.mockResolvedValue(undefined);
    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
  });

  it("starts Google sign-in with the provided callback URL", async () => {
    const user = userEvent.setup();

    render(<SignInWithGoogleButton callbackUrl="/-/crear" />);

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
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
        name: /iniciar sesion con google/i,
      })
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/error");
    });
  });
});
