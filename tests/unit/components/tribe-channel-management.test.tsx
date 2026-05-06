import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TribeChannelManagement } from "@/components/tribe-round/tribe-channel-management";

const tribeChannelManagementStyles = readFileSync(
  join(
    process.cwd(),
    "components",
    "tribe-round",
    "tribe-channel-management",
    "styles.module.scss"
  ),
  "utf8"
);

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const channels = [
  {
    accessScope: "tribemates" as const,
    emoji: "💬",
    id: "channel-general",
    name: "General",
    slug: "general",
    sortOrder: 10,
  },
  {
    accessScope: "tribemates" as const,
    emoji: "📚",
    id: "channel-resources",
    name: "Recursos",
    slug: "recursos",
    sortOrder: 20,
  },
];

describe("TribeChannelManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders channel controls in a responsive management layout", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    expect(screen.getByRole("heading", { name: "Canales" })).toBeInTheDocument();
    const createChannelButton = screen.getByRole("button", {
      name: "Crear canal",
    });

    expect(createChannelButton).toHaveClass("TribeChannelManagement__createButton");
    expect(createChannelButton).toHaveAttribute("type", "submit");

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const generalChannelItem = within(channelList)
      .getByDisplayValue("General")
      .closest("li");

    expect(channelList).toHaveClass("TribeChannelManagement__list");
    expect(generalChannelItem).not.toBeNull();
    expect(generalChannelItem).toHaveClass("TribeChannelManagement__item");
    expect(
      within(generalChannelItem as HTMLElement).getByRole("group", {
        name: "Acciones de General",
      })
    ).toHaveClass("TribeChannelManagement__actions");
  });

  it("keeps the channel form fluid across mobile and desktop widths", () => {
    expect(tribeChannelManagementStyles).toMatch(
      /\.TribeChannelManagement\s*{[^}]*max-width:\s*min\(100%,\s*980px\);/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /\.TribeChannelManagement\s*{[^}]*width:\s*100%;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__createForm\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__item\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__actions\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /@media\s*\(min-width:\s*56rem\)\s*{[^}]*\.TribeChannelManagement/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__createForm\s*{[^}]*grid-template-columns:\s*minmax\(4\.5rem,\s*0\.18fr\)\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__item\s*{[^}]*grid-template-columns:\s*minmax\(4\.5rem,\s*0\.16fr\)\s*minmax\(10rem,\s*0\.58fr\)\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
  });

  it("cleans stale target channels after deleting a channel", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Canal eliminada.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Canal eliminada.",
        }),
      });

    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const generalChannelItem = within(channelList)
      .getByDisplayValue("General")
      .closest("li") as HTMLElement;
    const resourcesChannelItem = within(channelList)
      .getByDisplayValue("Recursos")
      .closest("li") as HTMLElement;

    await user.selectOptions(
      within(resourcesChannelItem).getByRole("combobox", {
        name: "Mover mensajes a",
      }),
      "channel-general"
    );

    await user.click(
      within(generalChannelItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    await user.click(
      within(resourcesChannelItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][1].body).toBeUndefined();
  });

  it("keeps the selected target channel when deleting a channel with messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: "Canal eliminada.",
      }),
    });

    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const resourcesChannelItem = within(channelList)
      .getByDisplayValue("Recursos")
      .closest("li") as HTMLElement;

    await user.selectOptions(
      within(resourcesChannelItem).getByRole("combobox", {
        name: "Mover mensajes a",
      }),
      "channel-general"
    );

    await user.click(
      within(resourcesChannelItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/channels/channel-resources",
      expect.objectContaining({
        body: JSON.stringify({ targetChannelId: "channel-general" }),
        method: "DELETE",
      })
    );
  });
});
