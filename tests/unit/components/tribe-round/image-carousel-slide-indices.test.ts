import { resolveImageCarouselSlideIndicesOnReInit } from "@/components/tribe-round/tribe-round/image-carousel-slide-indices";

describe("resolveImageCarouselSlideIndicesOnReInit", () => {
  it("finalizes both indices to the selected snap so a video reached mid-scroll mounts its iframe instead of being stranded on its poster", () => {
    const resolution = resolveImageCarouselSlideIndicesOnReInit(2);

    expect(resolution.activeSlideIndex).toBe(2);
    expect(resolution.settledSlideIndex).toBe(2);
  });

  it("closes the scroll window because a reInit aborts the in-flight scroll and emits no follow-up settle", () => {
    const resolution = resolveImageCarouselSlideIndicesOnReInit(1);

    expect(resolution.isScrollInProgress).toBe(false);
  });

  it("keeps the indices on the selected snap when the carousel reInitializes already settled", () => {
    const resolution = resolveImageCarouselSlideIndicesOnReInit(0);

    expect(resolution.activeSlideIndex).toBe(0);
    expect(resolution.settledSlideIndex).toBe(0);
    expect(resolution.isScrollInProgress).toBe(false);
  });
});
