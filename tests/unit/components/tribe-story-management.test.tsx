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

  it("renders the story as read-only for non-leaders", () => {
    render(
      <TribeStoryManagement
        canEdit={false}
        story={{ content: "Nacimos en 2020 para invertir mejor." }}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Historia" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nacimos en 2020 para invertir mejor.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /guardar/i })
    ).not.toBeInTheDocument();
  });

  it("renders links inside the story content as safe anchors", () => {
    render(
      <TribeStoryManagement
        canEdit={false}
        story={{ content: "Mirá [nuestro manifiesto](https://tribu.example.com)." }}
        tribeSlug="matematica-pro"
      />
    );

    const link = screen.getByRole("link", { name: "nuestro manifiesto" });

    expect(link).toHaveAttribute("href", "https://tribu.example.com");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows an empty state when there is no story and the viewer cannot edit", () => {
    render(
      <TribeStoryManagement
        canEdit={false}
        story={null}
        tribeSlug="matematica-pro"
      />
    );

    expect(
      screen.getByText("El líder todavía no escribió la historia de la tribu.")
    ).toBeInTheDocument();
  });

  it("lets the leader edit and save the story", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryManagement
        canEdit
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
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/story",
        expect.objectContaining({
          body: JSON.stringify({ content: "Nacimos en 2020." }),
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
        canEdit
        story={{ content: "Nacimos en 2020." }}
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
        canEdit
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
