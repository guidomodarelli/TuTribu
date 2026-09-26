import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TribeStoryGallery } from "@/components/tribes/tribe-story-gallery";
import { TribeStoryVideoSlide } from "@/components/tribes/tribe-story-video-slide";

// jsdom lacks IntersectionObserver, which Embla needs to boot the carousel.
// This is a browser API stub, not a double of the carousel library.
class IntersectionObserverStub {
  disconnect() {
    return undefined;
  }

  observe() {
    return undefined;
  }

  takeRecords() {
    return [];
  }

  unobserve() {
    return undefined;
  }
}

globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

const VIDEO_TITLE = "Video 1 de la tribu";

function buildImageMedia(id: string, sortOrder: number) {
  return {
    externalVideoId: null,
    id,
    mediaType: "image" as const,
    sortOrder,
    url: `https://images.example.com/${id}.jpg`,
    videoProvider: null,
  };
}

describe("TribeStoryVideoSlide", () => {
  it("mounts the player on demand and hands it keyboard focus", async () => {
    const user = userEvent.setup();

    render(
      <TribeStoryVideoSlide
        externalVideoId="dQw4w9WgXcQ"
        title={VIDEO_TITLE}
        videoProvider="youtube"
      />
    );

    expect(screen.queryByTitle(VIDEO_TITLE)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: `Reproducir ${VIDEO_TITLE}` })
    );

    expect(screen.getByTitle(VIDEO_TITLE)).toHaveFocus();
  });

  it("stops a playing video when the gallery moves to another slide", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TribeStoryVideoSlide
        externalVideoId="dQw4w9WgXcQ"
        isActive
        title={VIDEO_TITLE}
        videoProvider="youtube"
      />
    );

    await user.click(
      screen.getByRole("button", { name: `Reproducir ${VIDEO_TITLE}` })
    );
    expect(screen.getByTitle(VIDEO_TITLE)).toBeInTheDocument();

    rerender(
      <TribeStoryVideoSlide
        externalVideoId="dQw4w9WgXcQ"
        isActive={false}
        title={VIDEO_TITLE}
        videoProvider="youtube"
      />
    );

    expect(screen.queryByTitle(VIDEO_TITLE)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Reproducir ${VIDEO_TITLE}` })
    ).toBeInTheDocument();
  });
});

describe("TribeStoryGallery", () => {
  it("renders one position indicator per resource with the first one current", () => {
    render(
      <TribeStoryGallery
        media={[
          buildImageMedia("primera", 0),
          buildImageMedia("segunda", 1),
          buildImageMedia("tercera", 2),
        ]}
      />
    );

    const indicators = within(
      screen.getByRole("group", { name: "Recursos de la galería" })
    ).getAllByRole("button");

    expect(indicators.map((indicator) => indicator.getAttribute("aria-label"))).toEqual([
      "Ir al recurso 1 de 3",
      "Ir al recurso 2 de 3",
      "Ir al recurso 3 de 3",
    ]);
    expect(indicators[0]).toHaveAttribute("aria-current", "true");
    expect(indicators[1]).not.toHaveAttribute("aria-current");
  });

  it("omits navigation and indicators for a single resource", () => {
    render(<TribeStoryGallery media={[buildImageMedia("unica", 0)]} />);

    expect(screen.getByAltText("Imagen 1 de la tribu")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Recursos de la galería" })
    ).not.toBeInTheDocument();
  });
});
