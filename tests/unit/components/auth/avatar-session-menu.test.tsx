import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { toast } from "beez-ui";

import { AvatarSessionMenuClient } from "@/components/auth/avatar-session-menu-client";

const pushMock = vi.fn();
const toastErrorMock = vi.fn();
const signOutMock = vi.fn();
const refreshRouteMock = vi.fn();
const refreshMemberSessionMock = vi.fn();

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
  refreshMemberSession: (...args: unknown[]) => refreshMemberSessionMock(...args),
  signOutMember: (...args: unknown[]) => signOutMock(...args),
}));

describe("AvatarSessionMenuClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
    refreshRouteMock.mockReset();
    refreshMemberSessionMock.mockReset();
    refreshMemberSessionMock.mockResolvedValue("active");

    (useRouter as Mock).mockReturnValue({
      push: pushMock,
      refresh: refreshRouteMock,
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

  it("names the member avatar only on the menu trigger after opening the dropdown", async () => {
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

    // The menu header repeats the avatar next to the visible name as decoration.
    expect(screen.getAllByAltText("Grace Hopper")).toHaveLength(1);
    expect(screen.getByRole("menu")).toHaveTextContent("Grace Hopper");
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

  describe("session keep-alive", () => {
    const authenticatedMember = {
      id: "dc2b4b91-7e42-41be-bcb5-a48b61a27740",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    } as const;
    const ONE_HOUR_MS = 60 * 60 * 1000;

    function renderMenu(member: typeof authenticatedMember | null) {
      return render(
        <AvatarSessionMenuClient
          authenticatedMember={member}
          signInPath="/auth/signin"
          signOutCallbackUrl="/auth/signin"
        />
      );
    }

    function showDocument() {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    it("renews the member session once when the platform loads", async () => {
      renderMenu(authenticatedMember);

      await waitFor(() => {
        expect(refreshMemberSessionMock).toHaveBeenCalledTimes(1);
      });
      expect(refreshMemberSessionMock).toHaveBeenCalledWith(expect.any(AbortSignal));
      // An active session keeps the rendered route: no full refresh.
      expect(refreshRouteMock).not.toHaveBeenCalled();
    });

    it("does not call the session endpoint for visitors without a session", async () => {
      renderMenu(null);

      await act(async () => {});

      expect(refreshMemberSessionMock).not.toHaveBeenCalled();
    });

    it("refreshes the route when the session expired so the UI stops showing the member", async () => {
      refreshMemberSessionMock.mockResolvedValue("expired");

      renderMenu(authenticatedMember);

      // Documented exception: the authentication state changed, the whole route must re-render.
      await waitFor(() => {
        expect(refreshRouteMock).toHaveBeenCalledTimes(1);
      });
    });

    it("keeps the rendered route when the renewal fails transiently", async () => {
      refreshMemberSessionMock.mockResolvedValue("failed");

      renderMenu(authenticatedMember);

      await waitFor(() => {
        expect(refreshMemberSessionMock).toHaveBeenCalledTimes(1);
      });
      expect(refreshRouteMock).not.toHaveBeenCalled();
    });

    it("renews again when the tab becomes visible only after the throttle window", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });

      try {
        renderMenu(authenticatedMember);
        await waitFor(() => {
          expect(refreshMemberSessionMock).toHaveBeenCalledTimes(1);
        });

        showDocument();
        await act(async () => {});
        expect(refreshMemberSessionMock).toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + ONE_HOUR_MS + 1);
        showDocument();

        await waitFor(() => {
          expect(refreshMemberSessionMock).toHaveBeenCalledTimes(2);
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("aborts the pending renewal when the menu unmounts", async () => {
      let receivedSignal: AbortSignal | undefined;
      refreshMemberSessionMock.mockImplementation((signal: AbortSignal) => {
        receivedSignal = signal;
        return new Promise(() => {});
      });

      const { unmount } = renderMenu(authenticatedMember);
      await waitFor(() => {
        expect(receivedSignal).toBeDefined();
      });

      unmount();

      expect(receivedSignal?.aborted).toBe(true);
    });
  });
});
