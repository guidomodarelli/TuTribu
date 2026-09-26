/** Exercises the shared theme context through the actual application providers. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { act, render as renderComponent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { useTheme } from "beez-ui";
import userEvent from "@testing-library/user-event";

import { ThemeModeDropdown } from "@/components/theme/theme-mode-dropdown";
import { AppProviders } from "@/components/providers/app-providers";

/** Exposes the public context observed by other theme-aware components. */
function ThemeConsumer() {
  const { theme, resolvedTheme } = useTheme();
  return <output aria-label="Tema compartido">{theme}:{resolvedTheme}</output>;
}

/** Mounts the production composition instead of mocking the theme library. */
function render(ui: ReactElement) {
  return renderComponent(<AppProviders isSitepingEnabled={false}>{ui}<ThemeConsumer /></AppProviders>);
}

type MatchMediaListener = (event: MediaQueryListEvent) => void;

const matchMediaListeners: MatchMediaListener[] = [];
let matchesDarkSystemTheme = false;

function emitSystemThemeChange(matches: boolean) {
  matchesDarkSystemTheme = matches;

  const event = {
    matches,
  } as MediaQueryListEvent;

  matchMediaListeners.forEach((listener) => listener(event));
}

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      addListener: vi.fn((listener: MatchMediaListener) => matchMediaListeners.push(listener)),
      removeListener: vi.fn((listener: MatchMediaListener) => {
        const index = matchMediaListeners.indexOf(listener);
        if (index >= 0) matchMediaListeners.splice(index, 1);
      }),
      addEventListener: vi.fn((eventName: string, listener: MatchMediaListener) => {
        if (eventName === "change") {
          matchMediaListeners.push(listener);
        }
      }),
      matches: matchesDarkSystemTheme,
      media: query,
      removeEventListener: vi.fn((eventName: string, listener: MatchMediaListener) => {
        if (eventName === "change") {
          const listenerIndex = matchMediaListeners.indexOf(listener);

          if (listenerIndex >= 0) {
            matchMediaListeners.splice(listenerIndex, 1);
          }
        }
      }),
    })),
  });
}

describe("ThemeModeDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    matchMediaListeners.length = 0;
    matchesDarkSystemTheme = false;
    installMatchMediaMock();
  });

  it("shows the available theme modes when the dropdown opens", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));

    expect(screen.getByRole("menuitemradio", { name: /claro/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /oscuro/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /sistema/i })).toBeInTheDocument();
  });

  it("names the selected mode on the trigger and updates it after choosing another one", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    expect(screen.getByRole("button", { name: "Cambiar tema, actual: Sistema" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /oscuro/i }));

    expect(await screen.findByRole("button", { name: "Cambiar tema, actual: Oscuro" })).toBeInTheDocument();
  });

  it("names the stored mode on the trigger when a preference already exists", () => {
    localStorage.setItem("tutribu-theme", "light");

    render(<ThemeModeDropdown />);

    expect(screen.getByRole("button", { name: "Cambiar tema, actual: Claro" })).toBeInTheDocument();
  });

  it("uses system as the default mode when there is no stored preference", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));

    expect(screen.getByRole("menuitemradio", { name: /sistema/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("stores dark mode and applies the dark document class", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /oscuro/i }));

    const storedThemeMode = localStorage.getItem("tutribu-theme");

    expect(storedThemeMode).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("dark:dark");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("stores light mode and removes the dark document class", async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add("dark");

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /claro/i }));

    const storedThemeMode = localStorage.getItem("tutribu-theme");

    expect(storedThemeMode).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows system theme changes while system mode is active", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /sistema/i }));

    act(() => emitSystemThemeChange(true));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    act(() => emitSystemThemeChange(false));

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });

  it("should restore the legacy preference in the shared context", () => {
    localStorage.setItem("tutribu-theme", "dark");
    render(<ThemeModeDropdown />);
    expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("dark:dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("should keep theme selection usable when storage is blocked", async () => {
    const storageRead = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function () { throw new DOMException("Blocked", "SecurityError"); });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function () { throw new DOMException("Blocked", "SecurityError"); });
    try {
      render(<ThemeModeDropdown />);
      await userEvent.click(screen.getByRole("button", { name: /cambiar tema/i }));
      await userEvent.click(screen.getByRole("menuitemradio", { name: /oscuro/i }));
      expect(document.documentElement).toHaveClass("dark");
      expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("dark:dark");
    } finally {
      storageRead.mockRestore();
      storageWrite.mockRestore();
    }
  });

  it("should preserve an explicit theme when the system preference changes", async () => {
    render(<ThemeModeDropdown />);
    await userEvent.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /claro/i }));
    act(() => emitSystemThemeChange(true));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("light:light");
  });

  it("should follow a preference changed in another tab", async () => {
    render(<ThemeModeDropdown />);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "tutribu-theme", newValue: "dark" })));
    await waitFor(() => expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("dark:dark"));
    expect(document.documentElement).toHaveClass("dark");
  });

  it("should recover an invalid stored preference using the system theme", async () => {
    localStorage.setItem("tutribu-theme", "invalid");
    matchesDarkSystemTheme = true;
    render(<ThemeModeDropdown />);
    await waitFor(() => expect(screen.getByLabelText("Tema compartido")).toHaveTextContent("system:dark"));
    expect(document.documentElement).toHaveClass("dark");
  });

  it("hydrates a stored preference without a mismatch and names it after hydration", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    const tree = (
      <AppProviders isSitepingEnabled={false}>
        <ThemeModeDropdown />
      </AppProviders>
    );

    localStorage.setItem("tutribu-theme", "dark");
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);

    expect(container.querySelector("button")).toHaveAttribute("aria-label", "Cambiar tema");

    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors).toEqual([]);
      expect(await screen.findByRole("button", { name: "Cambiar tema, actual: Oscuro" })).toBeInTheDocument();
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
