import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

describe("AvatarSessionMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();
    (fetch as jest.Mock).mockReset();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
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

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /menu de cuenta/i }));
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesion/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/auth/signout",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      })
    );
    expect(pushMock).toHaveBeenCalledWith("/auth/signin");
  });

  it("prevents duplicate sign-out requests while one is already in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: { ok: boolean }) => void) | null = null;
    (fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
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

    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch?.({ ok: true });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/signin");
    });
  });
});
