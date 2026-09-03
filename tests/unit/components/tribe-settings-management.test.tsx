import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeSettingsManagement } from "@/components/tribes/tribe-settings-management";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const identity = {
  coverUrl: "https://images.example.com/cover.jpg",
  logoUrl: "https://images.example.com/logo.png",
};

describe("TribeSettingsManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders the current identity with logo and cover previews", () => {
    render(<TribeSettingsManagement identity={identity} tribeSlug="test" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Ajustes" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Identidad" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Logo")).toHaveValue(identity.logoUrl);
    expect(screen.getByLabelText("Portada")).toHaveValue(identity.coverUrl);
    expect(
      screen.getByRole("img", { name: "Vista previa del logo" })
    ).toHaveAttribute("src", identity.logoUrl);
    expect(
      screen.getByRole("img", { name: "Vista previa de la portada" })
    ).toHaveAttribute("src", identity.coverUrl);
  });

  it("renders empty placeholders instead of previews when there is no identity yet", () => {
    render(<TribeSettingsManagement identity={null} tribeSlug="test" />);

    expect(screen.getByLabelText("Logo")).toHaveValue("");
    expect(screen.getByLabelText("Portada")).toHaveValue("");
    expect(
      screen.queryByRole("img", { name: "Vista previa del logo" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Vista previa de la portada" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sin logo")).toBeInTheDocument();
    expect(screen.getByText("Sin portada")).toBeInTheDocument();
  });

  it("shows a validation error next to the field and does not submit an invalid URL", async () => {
    const user = userEvent.setup();

    render(<TribeSettingsManagement identity={null} tribeSlug="test" />);

    await user.type(screen.getByLabelText("Logo"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ingresá una URL válida que empiece con http:// o https://"
    );
    expect(screen.getByLabelText("Logo")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("saves the trimmed identity and clears removed images", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ message: "Ajustes actualizados." }),
      ok: true,
    });

    render(<TribeSettingsManagement identity={identity} tribeSlug="test" />);

    await user.clear(screen.getByLabelText("Portada"));
    await user.clear(screen.getByLabelText("Logo"));
    await user.type(
      screen.getByLabelText("Logo"),
      "  https://images.example.com/new-logo.png  "
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/test/settings",
        expect.objectContaining({
          body: JSON.stringify({
            coverUrl: null,
            logoUrl: "https://images.example.com/new-logo.png",
          }),
          method: "PUT",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Ajustes actualizados.");
  });

  it("uploads a logo file and fills the URL with its delivery link", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: async () => ({
          deliveryUrl: "https://images.example.com/uploaded-logo.png",
          imageId: "image-1",
          uploadUrl: "https://upload.example.com/image-1",
        }),
        ok: true,
      })
      .mockResolvedValueOnce({ json: async () => ({}), ok: true });

    render(<TribeSettingsManagement identity={null} tribeSlug="test" />);

    const [logoUploadInput] = screen.getAllByLabelText("Subir imagen");
    const logoFile = new File(["logo"], "logo.png", { type: "image/png" });

    await user.upload(logoUploadInput, logoFile);

    await waitFor(() => {
      expect(screen.getByLabelText("Logo")).toHaveValue(
        "https://images.example.com/uploaded-logo.png"
      );
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/tribes/test/images",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      screen.getByRole("img", { name: "Vista previa del logo" })
    ).toBeInTheDocument();
  });

  it("rejects files that are not images without uploading them", async () => {
    const user = userEvent.setup({ applyAccept: false });

    render(<TribeSettingsManagement identity={null} tribeSlug="test" />);

    const [logoUploadInput] = screen.getAllByLabelText("Subir imagen");
    const textFile = new File(["hello"], "notes.txt", { type: "text/plain" });

    await user.upload(logoUploadInput, textFile);

    expect(toast.error).toHaveBeenCalledWith(
      "Elegí un archivo de imagen (JPG, PNG, GIF o WebP)."
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
