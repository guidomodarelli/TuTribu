import Image from "next/image";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import { TRIBE_STORY_MEDIA_TYPE } from "@/src/modules/tribes/constants/tribe-story";
import type { TribeStoryMediaResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_STORY_GALLERY_COPY = {
  imageAlt: (position: number) => `Imagen ${position} de la tribu`,
  videoTitle: (position: number) => `Video ${position} de la tribu`,
} as const;

const GALLERY_IMAGE_SIZES = "(min-width: 64rem) 40rem, 100vw";

type TribeStoryGalleryProps = {
  media: TribeStoryMediaResult[];
};

/**
 * Media gallery for the tribe story page: a carousel of leader-curated images
 * and embedded videos, mirroring the About header of communities like Skool.
 */
export function TribeStoryGallery({ media }: TribeStoryGalleryProps) {
  if (media.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeStoryGallery}>
      <Carousel className={styles.TribeStoryGallery__carousel}>
        <CarouselContent>
          {media.map((mediaItem, mediaIndex) => (
            <CarouselItem key={mediaItem.id}>
              <div className={styles.TribeStoryGallery__slide}>
                {mediaItem.mediaType === TRIBE_STORY_MEDIA_TYPE.video &&
                mediaItem.videoProvider &&
                mediaItem.externalVideoId ? (
                  <iframe
                    allow={PLAYER_IFRAME_ALLOW}
                    allowFullScreen
                    className={styles.TribeStoryGallery__video}
                    src={buildPlayerEmbedSource(
                      mediaItem.videoProvider as VideoProvider,
                      mediaItem.externalVideoId
                    )}
                    title={TRIBE_STORY_GALLERY_COPY.videoTitle(mediaIndex + 1)}
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
        {media.length > 1 ? (
          <>
            <CarouselPrevious
              className={styles.TribeStoryGallery__navButton}
            />
            <CarouselNext className={styles.TribeStoryGallery__navButton} />
          </>
        ) : null}
      </Carousel>
    </div>
  );
}
