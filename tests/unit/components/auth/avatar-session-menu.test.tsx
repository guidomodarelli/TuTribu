import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { toast } from "beez-ui";

import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";

const pushMock = vi.fn();
const toastErrorMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/src/modules/auth/infrastructure/better-auth/client", () => ({
  signOutMember: (...args: unknown[]) => signOutMock(...args),
}));

describe("AvatarSessionMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);

    (useRouter as Mock).mockReturnValue({
      push: pushMock,
    });
    (toast.error as Mock).mockImplementation(toastErrorMock);
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

    await user.click(screen.getByRole("button", { name: /menú de cuenta/i }));

    expect(screen.getByRole("menuitem", { name: /iniciar sesión/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(screen.queryByRole("menuitem", { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });

  it("shows sign-out action when member is authenticated", async () => {
    const user = userEvent.setup();

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByText("grace.hopper@example.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /menú de cuenta/i }));

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace.hopper@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesión/i }));

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
          role: "tribemate",
          avatarFallback: "GH",
          image: "https://example.com/grace-hopper.jpg",
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menú de cuenta/i }));

    expect(document.body.querySelectorAll('[data-slot="avatar"]')).toHaveLength(1);
  });

  it("loads the trigger avatar eagerly when the member image is above the fold", () => {
    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: "https://example.com/grace-hopper.jpg",
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    expect(screen.getByAltText("Grace Hopper")).toHaveAttribute("loading", "eager");
  });

  it("prevents duplicate sign-out requests while one is already in flight", async () => {
    const user = userEvent.setup();
    let resolveSignOut!: () => void;
    signOutMock.mockImplementation(
      function () { return new Promise((resolve) => {
          resolveSignOut = () => resolve(undefined);
        }); }
    );

    render(
      <AvatarSessionMenuClient
        authenticatedMember={{
          id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
          email: "grace.hopper@example.com",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menú de cuenta/i }));
    const signOutItem = screen.getByRole("menuitem", { name: /cerrar sesión/i });

    await user.click(signOutItem);
    await user.click(signOutItem);

    expect(signOutMock).toHaveBeenCalledTimes(1);

    resolveSignOut();

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
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        }}
        signInPath="/auth/signin"
        signOutCallbackUrl="/auth/signin"
      />
    );

    await user.click(screen.getByRole("button", { name: /menú de cuenta/i }));
    await user.click(screen.getByRole("menuitem", { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos cerrar la sesión. Intentá de nuevo."
      );
    });
    expect(pushMock).toHaveBeenCalledWith("/auth/error");
  });
});
