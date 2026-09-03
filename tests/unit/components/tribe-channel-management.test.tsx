import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PickerProps } from "emoji-picker-react";

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

function getChannelItem(channelName: string): HTMLElement {
  const channelList = screen.getByRole("list", {
    name: "Canales configurados",
  });

  return within(channelList).getByDisplayValue(channelName).closest("li") as HTMLElement;
}

function getCreateForm(): HTMLElement {
  return screen
    .getByRole("button", { name: "Crear canal" })
    .closest("form") as HTMLElement;
}

describe("TribeChannelManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders the page heading, the create form and one row per channel with its actions", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Canales" })
    ).toBeInTheDocument();
    const createChannelButton = screen.getByRole("button", {
      name: "Crear canal",
    });

    expect(createChannelButton).toHaveClass("TribeChannelManagement__createButton");
    expect(createChannelButton).toHaveAttribute("type", "submit");

    const channelList = screen.getByRole("list", {
      name: "Canales configurados",
    });
    const rondaChannelItem = getChannelItem("Ronda");

    expect(channelList).toHaveClass("TribeChannelManagement__list");
    expect(within(channelList).getAllByRole("listitem")).toHaveLength(2);
    expect(rondaChannelItem).toHaveClass("TribeChannelManagement__item");
    expect(
      within(rondaChannelItem).getByRole("group", {
        name: "Acciones de Ronda",
      })
    ).toHaveClass("TribeChannelManagement__actions");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows an action-oriented empty state when there are no channels", () => {
    render(<TribeChannelManagement channels={[]} tribeSlug="matematica-pro" />);

    expect(
      screen.getByText("Todavía no hay canales configurados.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Canales configurados" })
    ).not.toBeInTheDocument();
  });

  it("shows the selected channel emoji only once in the picker trigger", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const emojiTrigger = within(getChannelItem("Ronda")).getByRole("button", {
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

    await user.click(
      within(getCreateForm()).getByRole("button", { name: "Elegir ícono" })
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
    const createForm = getCreateForm();

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
    expect(await screen.findByDisplayValue("Novedades")).toBeInTheDocument();
    expect(
      within(getCreateForm()).getByRole("textbox", { name: "Nombre" })
    ).toHaveValue("");
  });

  it("shows the 30 character name limit while creating and editing channels", () => {
    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      within(getCreateForm()).getByRole("textbox", { name: "Nombre" })
    ).toHaveAttribute("maxlength", "30");
    expect(
      within(getChannelItem("Ronda")).getByRole("textbox", { name: "Nombre" })
    ).toHaveAttribute("maxlength", "30");
    expect(screen.getAllByText("Máximo 30 caracteres.")).not.toHaveLength(0);
  });

  it("keeps Guardar disabled until the channel is edited", async () => {
    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    const rondaChannelItem = getChannelItem("Ronda");
    const saveButton = within(rondaChannelItem).getByRole("button", {
      name: "Guardar",
    });

    expect(saveButton).toBeDisabled();
    expect(
      within(rondaChannelItem).queryByText("Cambios sin guardar")
    ).not.toBeInTheDocument();

    await user.type(
      within(rondaChannelItem).getByRole("textbox", { name: "Nombre" }),
      " general"
    );

    expect(saveButton).toBeEnabled();
    expect(
      within(rondaChannelItem).getByText("Cambios sin guardar")
    ).toBeInTheDocument();
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

    const longNameChannelItem = getChannelItem("Canal con nombre demasiado largo");

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

    const rondaChannelItem = getChannelItem("Ronda");

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
    await waitFor(() => {
      expect(
        within(getChannelItem("Ronda")).getByRole("button", { name: "Guardar" })
      ).toBeDisabled();
    });
  });

  it("asks for confirmation and a destination before deleting a channel with messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: "Canal eliminado.",
      }),
    });

    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      within(getChannelItem("Recursos")).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "¿Eliminar el canal Recursos?" })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", { name: "Mover mensajes a" })
    );
    await user.click(await screen.findByRole("option", { name: "🔥 Ronda" }));
    await user.click(screen.getByRole("button", { name: "Eliminar canal" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/channels/channel-resources",
        expect.objectContaining({
          body: JSON.stringify({ targetChannelId: "channel-ronda" }),
          method: "DELETE",
        })
      );
    });
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Recursos")).not.toBeInTheDocument();
    });
  });

  it("deletes without a destination and never offers a deleted channel as target", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Canal eliminado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Canal eliminado." }),
      });

    const user = userEvent.setup();

    render(
      <TribeChannelManagement
        channels={channels}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(
      within(getChannelItem("Ronda")).getByRole("button", { name: "Eliminar" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Eliminar canal" })
    );

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Ronda")).not.toBeInTheDocument();
    });
    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toBeUndefined();

    await user.click(
      within(getChannelItem("Recursos")).getByRole("button", {
        name: "Eliminar",
      })
    );

    expect(
      await screen.findByRole("heading", { name: "¿Eliminar el canal Recursos?" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Mover mensajes a" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Es el único canal: no hay otro al que mover sus mensajes.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar canal" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    expect((global.fetch as jest.Mock).mock.calls[1][1].body).toBeUndefined();
  });
});
