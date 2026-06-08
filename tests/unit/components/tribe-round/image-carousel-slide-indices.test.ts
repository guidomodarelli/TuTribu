import { resolveSettledImageCarouselSlideIndexOnReInit } from "@/components/tribe-round/tribe-round/image-carousel-slide-indices";

describe("resolveSettledImageCarouselSlideIndexOnReInit", () => {
  it("freezes the settled index while a scroll is in progress so the video iframe is not remounted mid-transition", () => {
    const settledSlideIndex = resolveSettledImageCarouselSlideIndexOnReInit({
      selectedSnapIndex: 2,
      currentSettledSlideIndex: 0,
      isScrollInProgress: true,
    });

    expect(settledSlideIndex).toBe(0);
  });

  it("advances the settled index to the selected snap when the carousel is settled", () => {
    const settledSlideIndex = resolveSettledImageCarouselSlideIndexOnReInit({
      selectedSnapIndex: 2,
      currentSettledSlideIndex: 0,
      isScrollInProgress: false,
    });

    expect(settledSlideIndex).toBe(2);
  });

  it("keeps the settled index unchanged when a settled reInit reports the same selected snap", () => {
    const settledSlideIndex = resolveSettledImageCarouselSlideIndexOnReInit({
      selectedSnapIndex: 1,
      currentSettledSlideIndex: 1,
      isScrollInProgress: false,
    });

    expect(settledSlideIndex).toBe(1);
  });
});
