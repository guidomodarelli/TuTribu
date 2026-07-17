import { render, screen } from "@testing-library/react";

import { TribeStoryAbout } from "@/components/tribes/tribe-story-about";

class ResizeObserverMock {
  disconnect = jest.fn();

  observe = jest.fn();

  unobserve = jest.fn();
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

class IntersectionObserverMock {
  disconnect = jest.fn();

  observe = jest.fn();

  takeRecords = jest.fn(() => []);

  unobserve = jest.fn();
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    addEventListener: jest.fn(),
    addListener: jest.fn(),
    dispatchEvent: jest.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
    removeListener: jest.fn(),
  })),
});

const STATS = {
  adminCount: 2,
  createdAt: "2026-01-10T00:00:00.000Z",
  memberCount: 128,
  name: "Matematica Pro",
  onlineCount: 7,
  openFreeJoinAvailable: false,
  openFreeJoinEnabled: false,
};

describe("TribeStoryAbout", () => {
  it("renders the story with formatting, gallery, and tribe facts", () => {
    render(
      <TribeStoryAbout
        offerPrice={null}
        stats={STATS}
        story={{
          content:
            "Somos **una tribu** de inversores\n- Honestidad\n- Comunidad\nMirá [el manifiesto](https://tribu.example.com/manifiesto)",
          coverUrl: "https://images.example.com/cover.jpg",
          logoUrl: "https://images.example.com/logo.png",
          media: [
            {
              externalVideoId: "dQw4w9WgXcQ",
              id: "media-1",
              mediaType: "video",
              sortOrder: 0,
              url: null,
              videoProvider: "youtube",
            },
            {
              externalVideoId: null,
              id: "media-2",
              mediaType: "image",
              sortOrder: 1,
              url: "https://images.example.com/tribu.jpg",
              videoProvider: null,
            },
          ],
          websiteUrl: "https://tribu.example.com",
        }}
        tribeName="Matematica Pro"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Historia" })
    ).toBeInTheDocument();
    expect(screen.getByText("una tribu").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("link", { name: "el manifiesto" })
    ).toHaveAttribute("href", "https://tribu.example.com/manifiesto");
    expect(
      screen.getByRole("button", { name: "Reproducir Video 1 de la tribu" })
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Imagen 2 de la tribu")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Matematica Pro" })
    ).toBeInTheDocument();
    expect(screen.getByText("Miembros")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("En línea")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(
      screen.getByAltText("Portada de Matematica Pro")
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Logo de Matematica Pro")
    ).toBeInTheDocument();
    expect(screen.getByText("Administradores")).toBeInTheDocument();
    expect(screen.getByText("Privada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sitio web" })).toHaveAttribute(
      "href",
      "https://tribu.example.com"
    );
    expect(
      screen.queryByRole("link", { name: "Unirse a la tribu" })
    ).not.toBeInTheDocument();
  });

  it("shows the price and join call to action for visitors", () => {
    render(
      <TribeStoryAbout
        joinHref="/matematica-pro"
        offerPrice={{ amountCents: 1500000, currency: "ARS" }}
        stats={STATS}
        story={{
          content: "Nacimos en 2020.",
          coverUrl: null,
          logoUrl: null,
          media: [],
          websiteUrl: null,
        }}
        tribeName="Matematica Pro"
      />
    );

    expect(screen.getByText("Precio")).toBeInTheDocument();
    expect(screen.getByText(/15\.000/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Unirse a la tribu" })
    ).toHaveAttribute("href", "/matematica-pro");
  });

  it("renders a free join form when the tribe allows tokenless free joins", () => {
    const freeJoinAction = jest.fn(async () => undefined);

    render(
      <TribeStoryAbout
        freeJoinAction={freeJoinAction}
        offerPrice={null}
        stats={{ ...STATS, openFreeJoinAvailable: true }}
        story={{
          content: "Nacimos en 2020.",
          coverUrl: null,
          logoUrl: null,
          media: [],
          websiteUrl: null,
        }}
        tribeName="Matematica Pro"
      />
    );

    expect(
      screen.getByRole("button", { name: "Unirse gratis" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Unirse a la tribu" })
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there is no story yet", () => {
    render(
      <TribeStoryAbout
        offerPrice={null}
        stats={STATS}
        story={null}
        tribeName="Matematica Pro"
      />
    );

    expect(
      screen.getByText("El líder todavía no escribió la historia de la tribu.")
    ).toBeInTheDocument();
  });
});
