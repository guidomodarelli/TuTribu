import { act, render, screen, waitFor, within } from "@testing-library/react";
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

const createdPost = {
  id: "post-2",
  author: {
    id: "member-1",
    name: "Grace Hopper",
    role: "member" as const,
    avatarFallback: "GH",
    image: null,
  },
  comments: [],
  content: "Nos vemos el viernes.",
  createdAt: "2026-04-26T13:00:00.000Z",
  likedByViewer: false,
  likeCount: 0,
  title: "Nuevo encuentro",
};

const createdComment = {
  id: "comment-1",
  author: {
    id: "member-1",
    name: "Grace Hopper",
    role: "member" as const,
    avatarFallback: "GH",
    image: null,
  },
  content: "Excelente clase",
  createdAt: "2026-04-26T13:05:00.000Z",
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

const algebraFeed = {
  viewerPermissions: {
    canComment: true,
    canCreatePost: true,
    canReact: true,
  },
  posts: [
    {
      id: "post-algebra-1",
      author: {
        id: "owner-2",
        name: "Emmy Noether",
        role: "owner" as const,
        avatarFallback: "EN",
        image: null,
      },
      comments: [],
      content: "Ya esta disponible la guia de ejercicios.",
      createdAt: "2026-04-26T14:00:00.000Z",
      likedByViewer: false,
      likeCount: 1,
      title: "Guia de algebra",
    },
  ],
};

type DeferredResponse = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

function createDeferredResponse(): DeferredResponse {
  let resolveResponse: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    promise,
    resolve: resolveResponse,
  };
}

describe("CommunityFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refreshMock.mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        message: "Publicacion creada.",
        post: createdPost,
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
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Crear publicación" })).not.toBeInTheDocument();
    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
    expect(screen.getByText("Nos vemos el viernes.")).toBeInTheDocument();
  });

  it("syncs local posts when the server feed changes", async () => {
    const { rerender } = render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    rerender(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="algebra-lineal"
        feed={algebraFeed}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Guia de algebra")).toBeInTheDocument();
    });
    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
  });

  it("ignores a stale post response after moving to another community", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    const { rerender } = render(
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
        expect.any(Object)
      );
    });

    rerender(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="algebra-lineal"
        feed={algebraFeed}
      />
    );

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Publicacion creada.",
          post: createdPost,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(screen.getByText("Guia de algebra")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("updates likes optimistically and reconciles without refreshing the route", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        likedByViewer: true,
        likeCount: 3,
        message: "Reaccion actualizada.",
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Me gusta · 2" }));

    expect(screen.getByRole("button", { name: "Me gusta · 3" })).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/communities/matematica-pro/posts/post-1/like",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("reverts an optimistic like when the request fails", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "No pudimos actualizar la reaccion.",
      }),
      ok: false,
      statusText: "Server Error",
    });

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Me gusta · 2" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar la reaccion.");
    });
    expect(screen.getByRole("button", { name: "Me gusta · 2" })).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("appends the returned comment without refreshing the route", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        comment: createdComment,
        message: "Comentario creado.",
      }),
      ok: true,
      statusText: "Created",
    });

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    const commentInput = screen.getByRole("textbox", {
      name: "Escribir un comentario",
    });
    await user.type(commentInput, "Excelente clase");
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/communities/matematica-pro/posts/post-1/comments",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Excelente clase",
          }),
          method: "POST",
        })
      );
    });

    const commentsSection = screen.getByRole("region", { name: "Comentarios" });
    expect(within(commentsSection).getByText("Excelente clase")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
