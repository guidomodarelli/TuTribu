import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";

const navigateToGoogleAuthStartMock = jest.fn();

jest.mock("@/src/modules/auth/infrastructure/oauth/start-google-auth-navigation", () => ({
  navigateToGoogleAuthStart: (...args: unknown[]) =>
    navigateToGoogleAuthStartMock(...args),
}));

describe("AutoSignInWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navigateToGoogleAuthStartMock.mockReset();
  });

  it("starts Google sign-in when the component mounts", async () => {
    render(<AutoSignInWithGoogle callbackUrl="/" />);

    await waitFor(() => {
      expect(navigateToGoogleAuthStartMock).toHaveBeenCalledWith("/");
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
      expect(navigateToGoogleAuthStartMock).toHaveBeenCalledWith("/auth/error");
    });

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    );

    expect(navigateToGoogleAuthStartMock).toHaveBeenCalledTimes(2);
    expect(navigateToGoogleAuthStartMock).toHaveBeenLastCalledWith("/auth/error");
  });
});
