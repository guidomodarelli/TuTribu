"use client";

import { useState } from "react";
import Image from "next/image";

import { Carousel } from "@golfo/ui";
import { TribeStoryVideoSlide } from "@/components/tribes/tribe-story-video-slide";
import { TRIBE_STORY_MEDIA_TYPE } from "@/src/modules/tribes/constants/tribe-story";
import type { TribeStoryMediaResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_GALLERY_COPY = {
  carouselLabel: "Galería de la tribu",
  imageAlt: (position: number) => `Imagen ${position} de la tribu`,
  slideLabel: (index: number, total: number) => `Recurso ${index + 1} de ${total}`,
  videoTitle: (position: number) => `Video ${position} de la tribu`,
} as const;

const GALLERY_IMAGE_SIZES = "(min-width: 64rem) 40rem, 100vw";

/** Each resource fills the gallery width, without neighbours peeking in. */
const GALLERY_SLIDE_SIZE = "100%";

/** The carousel always starts on the first resource, on the server and client. */
const FIRST_SLIDE_INDEX = 0;

type TribeStoryGalleryProps = {
  media: TribeStoryMediaResult[];
};

/**
 * Media gallery for the tribe story page: a carousel of leader-curated images
 * and embedded videos, mirroring the About header of communities like Skool.
 * It tracks the selected slide to stop a playing video as soon as the viewer
 * moves to another slide.
 */
export function TribeStoryGallery({ media }: TribeStoryGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(FIRST_SLIDE_INDEX);

  if (media.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeStoryGallery}>
      <Carousel
        index={selectedIndex}
        label={TRIBE_STORY_GALLERY_COPY.carouselLabel}
        onIndexChange={setSelectedIndex}
        slideLabel={TRIBE_STORY_GALLERY_COPY.slideLabel}
        slideSize={GALLERY_SLIDE_SIZE}
        // A playing video keeps the focus inside its slide; it must never pull
        // the carousel back.
        watchFocus={false}
      >
        {media.map((mediaItem, mediaIndex) => (
          <div className={styles.TribeStoryGallery__slide} key={mediaItem.id}>
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
        ))}
      </Carousel>
    </div>
  );
}
