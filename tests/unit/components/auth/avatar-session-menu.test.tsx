import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";

const pushMock = jest.fn();
const toastErrorMock = jest.fn();
const signOutMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  signOutMember: (...args: unknown[]) => signOutMock(...args),
}));

describe("AvatarSessionMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);

    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
    (toast.error as jest.Mock).mockImplementation(toastErrorMock);
  });

  it("shows sign-in action when there is no authenticated member", async () => {
    const user = userEvent.setup();

    render(
      <AvatarSessionMenuClient
        authenticatedMember={null}
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
    const user = userEvent.setup();

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByText("grace.hopper@example.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesion/i }));

    expect(signOutMock).toHaveBeenCalledWith();
    expect(pushMock).toHaveBeenCalledWith("/auth/signin");
  });

  it("keeps the avatar image only in the menu trigger after opening the dropdown", async () => {
    const user = userEvent.setup();

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: "https://example.com/grace-hopper.jpg",
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));

    expect(document.body.querySelectorAll('[data-slot="avatar"]')).toHaveLength(1);
  });

  it("prevents duplicate sign-out requests while one is already in flight", async () => {
    const user = userEvent.setup();
    let resolveSignOut: (() => void) | null = null;
    signOutMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignOut = () => resolve(undefined);
        })
    );

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));
    const signOutItem = screen.getByRole("menuitem", { name: /cerrar sesion/i });

    await user.click(signOutItem);
    await user.click(signOutItem);

    expect(signOutMock).toHaveBeenCalledTimes(1);

    resolveSignOut?.();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/signin");
    });
  });

  it("shows feedback and redirects safely when sign-out fails", async () => {
    const user = userEvent.setup();
    signOutMock.mockRejectedValue(new Error("sign_out_failure"));

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesion/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos cerrar la sesion. Intenta de nuevo."
      );
    });
    expect(pushMock).toHaveBeenCalledWith("/auth/error");
  });
});
