import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { CommunityFeed } from "@/components/community-feed/community-feed";

const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

const authenticatedMember = {
  id: "member-1",
  email: "grace.hopper@example.com",
  name: "Grace Hopper",
  role: "member",
  avatarFallback: "GH",
  image: null,
};

const feed = {
  viewerPermissions: {
    canComment: true,
    canCreatePost: true,
    canReact: true,
  },
  posts: [
    {
      id: "post-1",
      author: {
        id: "owner-1",
        name: "Ada Lovelace",
        role: "owner" as const,
        avatarFallback: "AL",
        image: null,
      },
      comments: [],
      content: "Bienvenida a la comunidad",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 2,
      title: "Anuncio inicial",
    },
  ],
};

describe("CommunityFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refreshMock.mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        message: "Publicacion creada.",
      }),
      ok: true,
      statusText: "Created",
    });
  });

  it("opens a centered composer modal from the collapsed composer", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    const feedSection = container.querySelector("section");

    expect(feedSection?.firstElementChild).toBe(
      screen.getByRole("button", { name: "Escribí algo" })
    );
    expect(screen.getByRole("button", { name: "Escribí algo" })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));

    expect(
      screen.getByRole("dialog", { name: "Crear publicación" })
    ).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título de la publicación" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Contenido de la publicación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Crear publicación" })).not.toBeInTheDocument();
  });

  it("submits title and content from the expanded composer", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título de la publicación" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido de la publicación" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/communities/matematica-pro/posts",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Nos vemos el viernes.",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Publicacion creada.");
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Crear publicación" })).not.toBeInTheDocument();
  });
});
