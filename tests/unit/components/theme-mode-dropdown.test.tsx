import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeModeDropdown } from "@/components/theme/theme-mode-dropdown";

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
    value: jest.fn((query: string) => ({
      addEventListener: jest.fn((eventName: string, listener: MatchMediaListener) => {
        if (eventName === "change") {
          matchMediaListeners.push(listener);
        }
      }),
      matches: matchesDarkSystemTheme,
      media: query,
      removeEventListener: jest.fn((eventName: string, listener: MatchMediaListener) => {
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
    jest.clearAllMocks();
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

    expect(localStorage.getItem("tutribu-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("stores light mode and removes the dark document class", async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add("dark");

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /claro/i }));

    expect(localStorage.getItem("tutribu-theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows system theme changes while system mode is active", async () => {
    const user = userEvent.setup();

    render(<ThemeModeDropdown />);

    await user.click(screen.getByRole("button", { name: /cambiar tema/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /sistema/i }));

    emitSystemThemeChange(true);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    emitSystemThemeChange(false);

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });
});
