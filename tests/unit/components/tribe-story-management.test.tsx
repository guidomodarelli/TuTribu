import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeStoryManagement } from "@/components/tribes/tribe-story-management";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const fetchMock = jest.fn();

describe("TribeStoryManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({ message: "Historia actualizada." })),
      ok: true,
    });
  });

  it("lets the leader edit and save the story with website and media", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        openFreeJoinEnabled={false}
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
            coverUrl: null,
            logoUrl: null,
            media: [
              {
                mediaType: "image",
                url: "https://images.example.com/tribu.jpg",
              },
            ],
            openFreeJoinEnabled: false,
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
        openFreeJoinEnabled={false}
        story={{
          content: "Nacimos en 2020.",
          coverUrl: null,
          logoUrl: null,
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
        openFreeJoinEnabled={false}
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Nacimos en 2020."
    );
    await user.click(screen.getByRole("button", { name: /agregar recurso/i }));
    await user.selectOptions(screen.getByLabelText("Tipo"), "video");
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
        openFreeJoinEnabled={false}
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

  it("renders a bold and list preview of the story content", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        openFreeJoinEnabled={false}
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    await user.type(
      screen.getByLabelText("Historia de la tribu"),
      "Somos **una tribu**\n- Honestidad"
    );

    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("una tribu").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem")).toHaveTextContent("Honestidad");
  });

  it("wraps the selection in bold from the toolbar", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        openFreeJoinEnabled={false}
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

  it("sends the free open join toggle in the save payload", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        openFreeJoinEnabled={false}
        story={{
          content: "Nacimos en 2020.",
          coverUrl: null,
          logoUrl: null,
          media: [],
          websiteUrl: null,
        }}
        tribeSlug="matematica-pro"
      />
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/story",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Nacimos en 2020.",
            coverUrl: null,
            logoUrl: null,
            media: [],
            openFreeJoinEnabled: true,
            websiteUrl: null,
          }),
          method: "PUT",
        })
      );
    });
  });

  it("shows the server error message when the save fails", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({
        message: "Solo el líder puede editar la historia de la tribu.",
      })),
      ok: false,
    });

    render(
      <TribeStoryManagement
        openFreeJoinEnabled={false}
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
