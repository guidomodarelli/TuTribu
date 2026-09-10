import { vi, describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "beez-ui";

import { TribeStoryManagement } from "@/components/tribes/tribe-story-management";

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const fetchMock = vi.fn();

describe("TribeStoryManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: vi.fn(async () => ({ message: "Historia actualizada." })),
      ok: true,
    });
  });

  it("lets the leader edit and save the story with website and media", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Nacimos en 2020."
    );
    await user.type(
      screen.getByLabelText("Sitio web"),
      "https://tribu.example.com"
    );
    await user.click(screen.getByRole("button", { name: /agregar recurso/i }));
    await user.type(
      screen.getByLabelText("URL de la imagen"),
      "https://images.example.com/tribu.jpg"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/story",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Nacimos en 2020.",
            media: [
              {
                mediaType: "image",
                url: "https://images.example.com/tribu.jpg",
              },
            ],
            websiteUrl: "https://tribu.example.com",
          }),
          method: "PUT",
        })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Historia actualizada.");
    });
  });

  it("blocks saving an empty story with a visible validation message", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={{
          content: "Nacimos en 2020.",
          media: [],
          websiteUrl: null,
        }}
        tribeSlug="matematica-pro"
      />
    );

    await user.clear(screen.getByLabelText("Historia de la tribu"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByText("Escribí la historia antes de guardar.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks saving an unparseable video link with a visible error", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Nacimos en 2020."
    );
    await user.click(screen.getByRole("button", { name: /agregar recurso/i }));
    await user.click(screen.getByRole("combobox", { name: "Tipo" }));
    await user.click(await screen.findByRole("option", { name: "Video" }));
    await user.type(
      screen.getByLabelText("Link del video"),
      "https://example.com/video"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByText(
        "Ingresá un link de video de YouTube, Vimeo, Wistia o Loom."
      )
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits the gallery to five media items", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    const addButton = screen.getByRole("button", { name: /agregar recurso/i });

    for (let clickIndex = 0; clickIndex < 5; clickIndex += 1) {
      await user.click(addButton);
    }

    expect(addButton).toBeDisabled();
    expect(screen.getAllByLabelText("URL de la imagen")).toHaveLength(5);
  });

  it("shows a thumbnail for a valid image resource and a placeholder otherwise", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={{
          content: "Nacimos en 2020.",
          media: [
            {
              externalVideoId: null,
              id: "media-1",
              mediaType: "image",
              sortOrder: 0,
              url: "https://images.example.com/tribu.jpg",
              videoProvider: null,
            },
          ],
          websiteUrl: null,
        }}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("img", { name: "Vista previa del recurso 1" })
    ).toHaveAttribute("src", "https://images.example.com/tribu.jpg");

    await user.click(screen.getByRole("button", { name: /agregar recurso/i }));

    expect(
      screen.queryByRole("img", { name: "Vista previa del recurso 2" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sin vista previa")).toBeInTheDocument();
  });

  it("reorders gallery resources with the move buttons", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={{
          content: "Nacimos en 2020.",
          media: [
            {
              externalVideoId: null,
              id: "media-1",
              mediaType: "image",
              sortOrder: 0,
              url: "https://images.example.com/primera.jpg",
              videoProvider: null,
            },
            {
              externalVideoId: null,
              id: "media-2",
              mediaType: "image",
              sortOrder: 1,
              url: "https://images.example.com/segunda.jpg",
              videoProvider: null,
            },
          ],
          websiteUrl: null,
        }}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("button", { name: "Subir Recurso 1 de 2" })
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Bajar Recurso 1 de 2" }));

    const [firstUrlInput, secondUrlInput] =
      screen.getAllByLabelText("URL de la imagen");

    expect(firstUrlInput).toHaveValue("https://images.example.com/segunda.jpg");
    expect(secondUrlInput).toHaveValue(
      "https://images.example.com/primera.jpg"
    );
  });

  it("hydrates saved gallery rows with the same ids the server rendered", async () => {
    const storyWithMedia = {
      content: "Nacimos en 2020.",
      media: [
        {
          externalVideoId: null,
          id: "media-1",
          mediaType: "image" as const,
          sortOrder: 0,
          url: "https://images.example.com/primera.jpg",
          videoProvider: null,
        },
        {
          externalVideoId: "dQw4w9WgXcQ",
          id: "media-2",
          mediaType: "video" as const,
          sortOrder: 1,
          url: null,
          videoProvider: "youtube" as const,
        },
      ],
      websiteUrl: null,
    };
    const element = (
      <TribeStoryManagement story={storyWithMedia} tribeSlug="matematica-pro" />
    );
    const container = document.createElement("div");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(function () { return undefined; });

    container.innerHTML = renderToString(element);
    document.body.appendChild(container);

    try {
      await act(async () => {
        hydrateRoot(container, element);
      });

      const hydrationErrors = consoleErrorSpy.mock.calls.filter((callArguments) =>
        callArguments.some(
          (argument) =>
            typeof argument === "string" && /hydrat/i.test(argument)
        )
      );

      expect(hydrationErrors).toEqual([]);
      expect(
        container.querySelectorAll('[id^="story-media-type-"]')
      ).toHaveLength(2);
    } finally {
      consoleErrorSpy.mockRestore();
      container.remove();
    }
  });

  it("switches between edit and preview modes with a visible tab switch", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Somos **una tribu**\n- Honestidad"
    );

    await user.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(screen.getByText("una tribu").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem")).toHaveTextContent("Honestidad");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Guardar" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Edición" }));

    expect(screen.getByLabelText("Historia de la tribu")).toHaveValue(
      "Somos **una tribu**\n- Honestidad"
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("previews the draft as members see it, with the tribe panel and website link", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        previewContext={{
          onlineMembers: [],
          stats: {
            adminCount: 2,
            coverUrl: null,
            createdAt: "2026-01-10T00:00:00.000Z",
            logoUrl: null,
            memberCount: 128,
            name: "Matematica Pro",
            onlineCount: 7,
            openFreeJoinAvailable: false,
            openFreeJoinEnabled: false,
          },
          tribeName: "Matematica Pro",
        }}
        story={{
          content: "Nacimos en 2020.",
          media: [],
          websiteUrl: "https://tribu.example.com",
        }}
        tribeSlug="matematica-pro"
      />
    );

    await user.clear(screen.getByLabelText("Sitio web"));
    await user.type(
      screen.getByLabelText("Sitio web"),
      "https://nuevo.example.com"
    );
    await user.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(
      screen.getByText(
        "Así van a ver la página los miembros y visitantes. Los cambios se aplican cuando guardás desde la pestaña Edición."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Matematica Pro" })
    ).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sitio web" })).toHaveAttribute(
      "href",
      "https://nuevo.example.com"
    );
    expect(
      screen.queryByRole("button", { name: /Unirse/ })
    ).not.toBeInTheDocument();
  });

  it("shows an empty preview hint when there is no content yet", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(
      screen.getByText("Escribí la historia para ver la vista previa.")
    ).toBeInTheDocument();
  });

  it("wraps the selection in bold from the toolbar", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Nacimos en 2020."
    );
    await user.click(screen.getByRole("button", { name: "Negrita" }));

    expect(screen.getByLabelText("Historia de la tribu")).toHaveValue(
      "Nacimos en 2020.****"
    );
  });

  it("shows the server error message when the save fails", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      json: vi.fn(async () => ({
        message: "Solo el líder puede editar la historia de la tribu.",
      })),
      ok: false,
    });

    render(
      <TribeStoryManagement
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Nacimos en 2020."
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Solo el líder puede editar la historia de la tribu."
      );
    });
  });
});
