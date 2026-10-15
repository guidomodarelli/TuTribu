import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  TooltipProvider,
} from "beez-ui";

import { AppRailToggle } from "@/components/app-rail/app-rail-toggle";

const DESKTOP_WIDTH_PX = 1280;
const PHONE_WIDTH_PX = 375;

/** Mounts the toggle next to a real sidebar, as the platform layout does. */
function renderRail({ defaultOpen }: { defaultOpen?: boolean } = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Eventos</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <AppRailToggle />
        <input aria-label="Buscar" />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function getSidebarState() {
  return screen.getByText("Eventos").closest("[data-slot=sidebar]");
}

describe("AppRailToggle", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: DESKTOP_WIDTH_PX });
  });

  it("folds the sidebar into the icon rail and announces it", async () => {
    const user = userEvent.setup();

    renderRail();

    const toggle = screen.getByRole("button", { name: "Contraer barra lateral" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-keyshortcuts", "[");

    await user.click(toggle);

    expect(getSidebarState()).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByRole("status")).toHaveTextContent("Barra lateral contraída");
  });

  it("unfolds a collapsed rail restored from the sidebar cookie", async () => {
    const user = userEvent.setup();

    renderRail({ defaultOpen: false });

    await user.click(screen.getByRole("button", { name: "Expandir barra lateral" }));

    expect(getSidebarState()).toHaveAttribute("data-state", "expanded");
    expect(screen.getByRole("status")).toHaveTextContent("Barra lateral expandida");
  });

  it("toggles the rail with the [ shortcut", async () => {
    const user = userEvent.setup();

    renderRail();

    await user.keyboard("[[");

    expect(getSidebarState()).toHaveAttribute("data-state", "collapsed");

    await user.keyboard("[[");

    expect(getSidebarState()).toHaveAttribute("data-state", "expanded");
  });

  it("ignores the [ shortcut while typing or with a modifier key", async () => {
    const user = userEvent.setup();

    renderRail();

    await user.click(screen.getByRole("textbox", { name: "Buscar" }));
    await user.keyboard("[[");

    expect(screen.getByRole("textbox", { name: "Buscar" })).toHaveValue("[");
    expect(getSidebarState()).toHaveAttribute("data-state", "expanded");

    await user.click(document.body);
    await user.keyboard("{Control>}[[{/Control}");

    expect(getSidebarState()).toHaveAttribute("data-state", "expanded");
  });

  it("opens the navigation sheet on phones", async () => {
    const user = userEvent.setup();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: PHONE_WIDTH_PX });

    renderRail();

    const toggle = screen.getByRole("button", { name: "Abrir navegación" });

    expect(toggle).toHaveAttribute("aria-haspopup", "dialog");

    await user.click(toggle);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eventos" })).toBeInTheDocument();
  });

  it("opens the navigation sheet with the [ shortcut on phones", async () => {
    const user = userEvent.setup();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: PHONE_WIDTH_PX });

    renderRail();

    await user.keyboard("[[");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Inside the open sheet the shortcut stays out of the dialog's way.
    await user.keyboard("[[");

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
