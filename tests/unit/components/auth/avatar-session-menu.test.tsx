import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AvatarSessionMenu } from "@/components/auth/avatar-session-menu";

const signOutMock = jest.fn();
const useSessionMock = jest.fn();

jest.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => useSessionMock(),
}));

describe("AvatarSessionMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signOutMock.mockReset();
  });

  it("shows sign-in action when there is no authenticated member", async () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    const user = userEvent.setup();

    render(
      <AvatarSessionMenu
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));

    expect(screen.getByRole("menuitem", { name: /iniciar sesion/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(screen.queryByRole("menuitem", { name: /cerrar sesion/i })).not.toBeInTheDocument();
  });

  it("shows sign-out action when member is authenticated", async () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          image: null,
        },
      },
      status: "authenticated",
    });
    const user = userEvent.setup();

    render(
      <AvatarSessionMenu
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesion/i }));

    expect(signOutMock).toHaveBeenCalledWith({
      callbackUrl: "/auth/signin",
    });
  });
});
