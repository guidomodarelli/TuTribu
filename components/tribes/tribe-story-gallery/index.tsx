"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi, SPRING_LAYOUT } from "beez-ui";
import { TribeStoryVideoSlide } from "@/components/tribes/tribe-story-video-slide";
import { TRIBE_STORY_MEDIA_TYPE } from "@/src/modules/tribes/constants/tribe-story";
import type { TribeStoryMediaResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_GALLERY_COPY = {
  imageAlt: (position: number) => `Imagen ${position} de la tribu`,
  indicatorLabel: (position: number, total: number) =>
    `Ir al recurso ${position} de ${total}`,
  indicatorsLabel: "Recursos de la galería",
  videoTitle: (position: number) => `Video ${position} de la tribu`,
} as const;

const GALLERY_IMAGE_SIZES = "(min-width: 64rem) 40rem, 100vw";

/** Embla events that can change the selected slide. */
const GALLERY_CAROUSEL_EVENT = {
  reInit: "reInit",
  select: "select",
} as const;

/** The carousel always starts on the first resource, on the server and client. */
const FIRST_SLIDE_INDEX = 0;

type TribeStoryGalleryProps = {
  media: TribeStoryMediaResult[];
};

/**
 * Media gallery for the tribe story page: a carousel of leader-curated images
 * and embedded videos, mirroring the About header of communities like Skool.
 * It tracks the selected slide to drive the position indicators and to stop a
 * playing video as soon as the viewer moves to another slide.
 */
export function TribeStoryGallery({ media }: TribeStoryGalleryProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(FIRST_SLIDE_INDEX);
  const indicatorLayoutId = useId();
  const hasMultipleSlides = media.length > 1;

  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const syncSelectedIndex = () => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };

    syncSelectedIndex();
    carouselApi.on(GALLERY_CAROUSEL_EVENT.select, syncSelectedIndex);
    carouselApi.on(GALLERY_CAROUSEL_EVENT.reInit, syncSelectedIndex);

    return () => {
      carouselApi.off(GALLERY_CAROUSEL_EVENT.select, syncSelectedIndex);
      carouselApi.off(GALLERY_CAROUSEL_EVENT.reInit, syncSelectedIndex);
    };
  }, [carouselApi]);

  if (media.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeStoryGallery}>
      <Carousel
        className={styles.TribeStoryGallery__carousel}
        setApi={setCarouselApi}
      >
        <CarouselContent>
          {media.map((mediaItem, mediaIndex) => (
            <CarouselItem key={mediaItem.id}>
              <div className={styles.TribeStoryGallery__slide}>
                {mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video &&
                mediaItem.videoProvider &&
                mediaItem.externalVideoId ? (
                  <TribeStoryVideoSlide
                    externalVideoId={mediaItem.externalVideoId}
                    isActive={mediaIndex === selectedIndex}
                    title={TRIBE_STORY_GALLERY_COPY.videoTitle(mediaIndex + 1)}
                    videoProvider={mediaItem.videoProvider as VideoProvider}
                  />
                ) : mediaItem.url ? (
                  <Image
                    alt={TRIBE_STORY_GALLERY_COPY.imageAlt(mediaIndex + 1)}
                    className={styles.TribeStoryGallery__image}
                    fill
                    sizes={GALLERY_IMAGE_SIZES}
                    src={mediaItem.url}
                    unoptimized
                  />
                ) : null}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {hasMultipleSlides ? (
          <>
            <CarouselPrevious
              className={styles.TribeStoryGallery__navButton}
            />
            <CarouselNext className={styles.TribeStoryGallery__navButton} />
          </>
        ) : null}
      </Carousel>
      {hasMultipleSlides ? (
        <div
          aria-label={TRIBE_STORY_GALLERY_COPY.indicatorsLabel}
          className={styles.TribeStoryGallery__indicators}
          role="group"
        >
          {media.map((mediaItem, mediaIndex) => {
            const isSelected = mediaIndex === selectedIndex;

            return (
              <button
                aria-current={isSelected ? true : undefined}
                aria-label={TRIBE_STORY_GALLERY_COPY.indicatorLabel(
                  mediaIndex + 1,
                  media.length
                )}
                className={styles.TribeStoryGallery__indicator}
                key={mediaItem.id}
                onClick={() => carouselApi?.scrollTo(mediaIndex)}
                type="button"
              >
                <span
                  aria-hidden
                  className={styles.TribeStoryGallery__indicatorTrack}
                >
                  {isSelected ? (
                    <motion.span
                      className={styles.TribeStoryGallery__indicatorFill}
                      layoutId={indicatorLayoutId}
                      transition={SPRING_LAYOUT}
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
