import type { ReactElement, ReactNode } from "react";
import {
  act,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { CommunityFeed } from "@/components/community-feed/community-feed";
import { TooltipProvider } from "@/components/ui/tooltip";

const refreshMock = jest.fn();

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

function render(ui: ReactElement) {
  return renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    ),
  });
}

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

const postCategories = [
  {
    accessScope: "members" as const,
    emoji: "⭐",
    id: "category-intro",
    name: "Intro and Goals",
    slug: "intro-and-goals",
    sortOrder: 10,
  },
  {
    accessScope: "members" as const,
    emoji: "💬",
    id: "category-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  },
];

const createdPost = {
  id: "post-2",
  author: {
    id: "member-1",
    name: "Grace Hopper",
    role: "member" as const,
    avatarFallback: "GH",
    image: null,
  },
  category: postCategories[0],
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
  activeCategoryId: null,
  categories: postCategories,
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
      category: postCategories[1],
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
  activeCategoryId: null,
  categories: postCategories,
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
      category: postCategories[0],
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
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Categoría de la publicación" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Crear publicación" })).not.toBeInTheDocument();
  });

  it("renders the post category with the timestamp metadata", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    const postArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(postArticle).not.toBeNull();

    const categoryBadge = within(postArticle as HTMLElement).getByText(
      (_, element) => element?.textContent === "💬 General"
    );
    const postDate = within(postArticle as HTMLElement).getByText("26 abr");

    expect(categoryBadge.parentElement).not.toHaveTextContent("2026");
    expect(categoryBadge.parentElement).toHaveTextContent("·");

    await user.hover(postDate);

    expect(
      await screen.findAllByText((_, element) =>
        Boolean(
          element?.textContent?.startsWith("Publicacion creada: 26 abr 2026")
        )
      )
    ).not.toHaveLength(0);
  });

  it("renders the post category with the previous year timestamp metadata", () => {
    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={{
          ...feed,
          posts: [
            {
              ...feed.posts[0],
              createdAt: "2025-04-26T12:00:00.000Z",
            },
          ],
        }}
      />
    );

    const postArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(postArticle).not.toBeNull();
    expect(within(postArticle as HTMLElement).getByText("abr 2025")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Categoría de la publicación" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/communities/matematica-pro/posts",
        expect.objectContaining({
          body: JSON.stringify({
            categoryId: "category-intro",
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

  it("selects a post category using keyboard interactions", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
    await user.click(screen.getByRole("button", { name: "Categoría de la publicación" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(
      screen.getByRole("button", { name: "Categoría de la publicación" })
    ).toHaveTextContent("⭐ Intro and Goals");
  });

  it("shows visible missing item validation when submitting an incomplete post", async () => {
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

    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(screen.getByText("Falta completar:")).toBeInTheDocument();
    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(within(missingRequirements).getByText("Seleccionar categoría")).toBeInTheDocument();
    expect(within(missingRequirements).getByRole("listitem")).toHaveTextContent(
      "-Seleccionar categoría"
    );
    expect(within(missingRequirements).queryByText("Completar título")).not.toBeInTheDocument();
    expect(within(missingRequirements).queryByText("Publicar el contenido")).not.toBeInTheDocument();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lists every missing composer requirement before submitting", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(within(missingRequirements).getByText("Completar título")).toBeInTheDocument();
    expect(within(missingRequirements).getByText("Publicar el contenido")).toBeInTheDocument();
    expect(within(missingRequirements).getByText("Seleccionar categoría")).toBeInTheDocument();
    expect(within(missingRequirements).getAllByRole("listitem")).toEqual([
      expect.objectContaining({ textContent: "-Completar título" }),
      expect.objectContaining({ textContent: "-Publicar el contenido" }),
      expect.objectContaining({ textContent: "-Seleccionar categoría" }),
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("starts with a blank composer every time the modal opens", async () => {
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
      "Borrador temporal"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido de la publicación" }),
      "Contenido temporal"
    );
    await user.click(screen.getByRole("button", { name: "Categoría de la publicación" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));

    expect(screen.getByRole("textbox", { name: "Título de la publicación" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Contenido de la publicación" })
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Categoría de la publicación" })
    ).toHaveTextContent("Seleccionar categoría");
  });

  it("filters posts by category chips", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Intro and Goals" }));

    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Categoría de la publicación" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
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

    expect(
      screen.queryByRole("dialog", { name: "Publicación" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Me gusta 2" }));

    expect(screen.getByRole("button", { name: "Me gusta 3" })).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Publicación" })
    ).not.toBeInTheDocument();

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

  it("opens the post details dialog from the post content without nesting action buttons", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    const postDetailsButton = screen.getByRole("button", {
      name: /Abrir publicación: Anuncio inicial/i,
    });

    await user.click(postDetailsButton);

    expect(
      screen.getByRole("dialog", { name: "Publicación" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Publicación" })
      ).not.toBeInTheDocument();
    });

    postDetailsButton.focus();

    expect(postDetailsButton).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Publicación" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Publicación" })
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Me gusta 2" }));

    expect(
      screen.queryByRole("dialog", { name: "Publicación" })
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Me gusta 2" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar la reaccion.");
    });
    expect(screen.getByRole("button", { name: "Me gusta 2" })).toBeInTheDocument();
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

    expect(
      screen.queryByRole("textbox", {
        name: "Escribir un comentario",
      })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Comentarios" })).not.toBeInTheDocument();

    const postDetailsButton = screen.getByRole("button", {
      name: /Abrir publicación: Anuncio inicial/i,
    });

    await user.click(postDetailsButton);

    expect(
      screen.getByRole("dialog", { name: "Publicación" })
    ).toBeInTheDocument();

    const commentInput = screen.getByRole("textbox", {
      name: "Escribir un comentario",
    });
    await user.type(commentInput, "Excelente clase");
    await user.keyboard("{Enter}");

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

  it("opens the post details dialog with keyboard interactions", async () => {
    const user = userEvent.setup();

    render(
      <CommunityFeed
        authenticatedMember={authenticatedMember}
        communitySlug="matematica-pro"
        feed={feed}
      />
    );

    const postDetailsButton = screen.getByRole("button", {
      name: /Abrir publicación: Anuncio inicial/i,
    });

    postDetailsButton.focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Publicación" })
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Comentarios" })).toBeInTheDocument();
  });
});
