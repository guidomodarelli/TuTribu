import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AutoSignInWithGoogle } from "@/components/auth/auto-sign-in-with-google";

const signInMock = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

describe("AutoSignInWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signInMock.mockReset();
  });

  it("starts Google sign-in when the component mounts", async () => {
    render(<AutoSignInWithGoogle callbackUrl="/" />);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("google", {
        callbackUrl: "/",
      });
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
      expect(signInMock).toHaveBeenCalledWith("google", {
        callbackUrl: "/auth/error",
      });
    });

    await user.click(
      screen.getByRole("button", {
        name: /iniciar sesion con google/i,
      })
    );

    expect(signInMock).toHaveBeenCalledTimes(2);
    expect(signInMock).toHaveBeenLastCalledWith("google", {
      callbackUrl: "/auth/error",
    });
  });
});
