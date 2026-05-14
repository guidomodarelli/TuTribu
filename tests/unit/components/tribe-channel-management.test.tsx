import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PickerProps } from "emoji-picker-react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TribeChannelManagement } from "@/components/tribe-round/tribe-channel-management";

type MockEmojiPickerProps = Pick<
  PickerProps,
  | "autoFocusSearch"
  | "customEmojis"
  | "defaultSkinTone"
  | "emojiStyle"
  | "lazyLoadEmojis"
  | "onEmojiClick"
  | "previewConfig"
  | "searchDisabled"
  | "skinTonePickerLocation"
  | "skinTonesDisabled"
  | "suggestedEmojisMode"
  | "theme"
>;

function mockEmojiPicker({
  autoFocusSearch,
  customEmojis,
  defaultSkinTone,
  emojiStyle,
  lazyLoadEmojis,
  onEmojiClick,
  previewConfig,
  searchDisabled,
  skinTonePickerLocation,
  skinTonesDisabled,
  suggestedEmojisMode,
  theme,
}: MockEmojiPickerProps) {
  return (
    <button
      data-auto-focus-search={String(autoFocusSearch)}
      data-custom-emojis-count={String(customEmojis?.length ?? 0)}
      data-default-skin-tone={defaultSkinTone}
      data-emoji-style={emojiStyle}
      data-lazy-load-emojis={String(lazyLoadEmojis)}
      data-search-disabled={String(searchDisabled)}
      data-show-preview={String(previewConfig?.showPreview)}
      data-skin-tone-location={skinTonePickerLocation}
      data-skin-tones-disabled={String(skinTonesDisabled)}
      data-suggestions-mode={suggestedEmojisMode}
      data-theme={theme}
      type="button"
      onClick={() => {
        onEmojiClick({ emoji: "⭐" });
      }}
    >
      Elegir estrella
    </button>
  );
}

jest.mock("emoji-picker-react", () => ({
  __esModule: true,
  EmojiStyle: {
    APPLE: "apple",
    NATIVE: "native",
  },
  SkinTonePickerLocation: {
    SEARCH: "SEARCH",
  },
  SkinTones: {
    NEUTRAL: "neutral",
  },
  SuggestionMode: {
    RECENT: "recent",
  },
  Theme: {
    AUTO: "auto",
    DARK: "dark",
    LIGHT: "light",
  },
  default: mockEmojiPicker,
}));

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
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
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
    const rondaChannelItem = within(channelList)
      .getByDisplayValue("Ronda")
      .closest("li");

    expect(channelList).toHaveClass("TribeChannelManagement__list");
    expect(rondaChannelItem).not.toBeNull();
    expect(rondaChannelItem).toHaveClass("TribeChannelManagement__item");
    expect(
      within(rondaChannelItem as HTMLElement).getByRole("group", {
        name: "Acciones de Ronda",
      })
    ).toHaveClass("TribeChannelManagement__actions");
  });

  it("shows the selected channel emoji only once in the picker trigger", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const rondaChannelItem = within(channelList)
      .getByDisplayValue("Ronda")
      .closest("li") as HTMLElement;
    const emojiTrigger = within(rondaChannelItem).getByRole("button", {
      name: "Elegir ícono",
    });
    const selectedEmojiMatches = emojiTrigger.textContent?.match(/🔥/gu) ?? [];

    expect(selectedEmojiMatches).toHaveLength(1);
  });

  it("opens the emoji picker with the configured appearance and feature options", async () => {
    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const createButton = screen.getByRole("button", { name: "Crear canal" });
    const createForm = createButton.closest("form") as HTMLElement;

    await user.click(
      within(createForm).getByRole("button", { name: "Elegir ícono" })
    );

    const emojiPicker = screen.getByRole("button", { name: "Elegir estrella" });

    expect(emojiPicker).toHaveAttribute("data-emoji-style", "apple");
    expect(emojiPicker).toHaveAttribute("data-theme", "light");
    expect(emojiPicker).toHaveAttribute("data-skin-tones-disabled", "false");
    expect(emojiPicker).toHaveAttribute("data-search-disabled", "false");
    expect(emojiPicker).toHaveAttribute("data-auto-focus-search", "true");
    expect(emojiPicker).toHaveAttribute("data-lazy-load-emojis", "true");
    expect(emojiPicker).toHaveAttribute("data-show-preview", "false");
    expect(emojiPicker).toHaveAttribute("data-custom-emojis-count", "0");
    expect(emojiPicker).toHaveAttribute("data-default-skin-tone", "neutral");
    expect(emojiPicker).toHaveAttribute("data-suggestions-mode", "recent");
    expect(emojiPicker).toHaveAttribute("data-skin-tone-location", "SEARCH");
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
      /&__createForm\s*{[^}]*grid-template-columns:\s*max-content\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__item\s*{[^}]*grid-template-columns:\s*max-content\s*minmax\(10rem,\s*0\.58fr\)\s*minmax\(12rem,\s*1fr\)\s*max-content;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__actions\s*{[^}]*align-self:\s*start;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__createButton\s*{[^}]*align-self:\s*start;/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__createButton\s*{[^}]*margin-top:\s*calc\(\(0\.82rem\s*\*\s*1\.25\)\s*\+\s*0\.4rem\);/s
    );
    expect(tribeChannelManagementStyles).toMatch(
      /&__actions\s*{[^}]*margin-top:\s*calc\(\(0\.82rem\s*\*\s*1\.25\)\s*\+\s*0\.4rem\);/s
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
    const rondaChannelItem = within(channelList)
      .getByDisplayValue("Ronda")
      .closest("li") as HTMLElement;
    const resourcesChannelItem = within(channelList)
      .getByDisplayValue("Recursos")
      .closest("li") as HTMLElement;

    await user.selectOptions(
      within(resourcesChannelItem).getByRole("combobox", {
        name: "Mover mensajes a",
      }),
      "channel-ronda"
    );

    await user.click(
      within(rondaChannelItem).getByRole("button", {
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

  it("creates a channel only after selecting an emoji from the picker", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: {
          accessScope: "tribemates",
          emoji: "⭐",
          id: "channel-news",
          name: "Novedades",
          slug: "novedades",
          sortOrder: 30,
        },
        message: "Canal creado.",
      }),
    });

    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const createButton = screen.getByRole("button", { name: "Crear canal" });
    const createForm = createButton.closest("form") as HTMLElement;

    expect(createButton).toBeDisabled();
    expect(
      within(createForm).queryByRole("textbox", { name: "Ícono" })
    ).not.toBeInTheDocument();

    await user.type(
      within(createForm).getByRole("textbox", { name: "Nombre" }),
      "Novedades"
    );
    expect(createButton).toBeDisabled();

    await user.click(
      within(createForm).getByRole("button", { name: "Elegir ícono" })
    );
    await user.click(screen.getByRole("button", { name: "Elegir estrella" }));
    await user.click(createButton);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/channels",
      expect.objectContaining({
        body: JSON.stringify({
          emoji: "⭐",
          name: "Novedades",
        }),
        method: "POST",
      })
    );
  });

  it("shows the 30 character name limit while creating and editing channels", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const createButton = screen.getByRole("button", { name: "Crear canal" });
    const createForm = createButton.closest("form") as HTMLElement;
    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const rondaChannelItem = within(channelList)
      .getByDisplayValue("Ronda")
      .closest("li") as HTMLElement;

    expect(
      within(createForm).getByRole("textbox", { name: "Nombre" })
    ).toHaveAttribute("maxlength", "30");
    expect(
      within(rondaChannelItem).getByRole("textbox", { name: "Nombre" })
    ).toHaveAttribute("maxlength", "30");
    expect(screen.getAllByText("Máximo 30 caracteres.")).not.toHaveLength(0);
  });

  it("prevents saving an edited channel with a name over 30 characters", async () => {
    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={[
          {
            ...channels[0],
            name: "Canal con nombre demasiado largo",
          },
          channels[1],
        ]}
        tribeSlug="matematica-pro"
      />
    );

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const longNameChannelItem = within(channelList)
      .getByDisplayValue("Canal con nombre demasiado largo")
      .closest("li") as HTMLElement;

    expect(
      within(longNameChannelItem).getByText("Usá 30 caracteres o menos.")
    ).toBeInTheDocument();
    expect(
      within(longNameChannelItem).getByRole("button", { name: "Guardar" })
    ).toBeDisabled();

    await user.click(
      within(longNameChannelItem).getByRole("button", { name: "Guardar" })
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("updates a channel emoji selected from the picker", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        channel: {
          ...channels[0],
          emoji: "⭐",
        },
        message: "Canal actualizado.",
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
    const rondaChannelItem = within(channelList)
      .getByDisplayValue("Ronda")
      .closest("li") as HTMLElement;

    await user.click(
      within(rondaChannelItem).getByRole("button", { name: "Elegir ícono" })
    );
    await user.click(screen.getByRole("button", { name: "Elegir estrella" }));
    await user.click(
      within(rondaChannelItem).getByRole("button", { name: "Guardar" })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/channels/channel-ronda",
      expect.objectContaining({
        body: JSON.stringify({
          emoji: "⭐",
          name: "Ronda",
          sortOrder: 10,
        }),
        method: "PATCH",
      })
    );
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
      "channel-ronda"
    );

    await user.click(
      within(resourcesChannelItem).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/channels/channel-resources",
      expect.objectContaining({
        body: JSON.stringify({ targetChannelId: "channel-ronda" }),
        method: "DELETE",
      })
    );
  });
});
