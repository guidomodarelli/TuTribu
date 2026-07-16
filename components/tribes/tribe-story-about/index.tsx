import { Link } from "@/components/navigation/link";
import { Button } from "@/components/ui/button";
import { RichStoryContent } from "@/components/rich-text/rich-story-content";
import { TribeStoryGallery } from "@/components/tribes/tribe-story-gallery";
import type {
  TribeStoryResult,
  TribeStoryStatsResult,
} from "@/src/modules/tribes/application/results/tribe-story-result";
import styles from "./styles.module.scss";

const TRIBE_STORY_ABOUT_COPY = {
  adminsLabel: "Administradores",
  createdLabel: "Creada en",
  emptyState: "El líder todavía no escribió la historia de la tribu.",
  joinButton: "Unirse a la tribu",
  membersLabel: "Miembros",
  priceLabel: "Precio",
  privacyLabel: "Privacidad",
  privacyPrivate: "Privada",
  sidebarAriaLabel: "Datos de la tribu",
  title: "Historia",
  websiteLabel: "Sitio web",
} as const;

const ABOUT_DATE_FORMAT = {
  locale: "es-AR",
  month: "long",
  year: "numeric",
} as const;

const ABOUT_AMOUNT_FORMAT = {
  currencyStyle: "currency",
  locale: "es-AR",
} as const;

const ABOUT_AMOUNT_DIVISOR = 100;
const ABOUT_PRICE_SUFFIX = "/mes";
const ABOUT_LINK_TARGET = "_blank";
const ABOUT_LINK_REL = "noreferrer";

export type TribeStoryAboutOfferPrice = {
  amountCents: number;
  currency: string;
};

type TribeStoryAboutProps = {
  joinHref?: string;
  offerPrice: TribeStoryAboutOfferPrice | null;
  stats: TribeStoryStatsResult | null;
  story: TribeStoryResult | null;
  tribeName: string;
};

function formatCreatedAt(createdAt: string): string {
  return new Intl.DateTimeFormat(ABOUT_DATE_FORMAT.locale, {
    month: ABOUT_DATE_FORMAT.month,
    year: ABOUT_DATE_FORMAT.year,
  }).format(new Date(createdAt));
}

function formatOfferPrice(offerPrice: TribeStoryAboutOfferPrice): string {
  const formattedAmount = new Intl.NumberFormat(ABOUT_AMOUNT_FORMAT.locale, {
    currency: offerPrice.currency,
    style: ABOUT_AMOUNT_FORMAT.currencyStyle,
  }).format(offerPrice.amountCents / ABOUT_AMOUNT_DIVISOR);

  return formattedAmount + ABOUT_PRICE_SUFFIX;
}

/**
 * Read-only "About" view of the tribe story: media gallery, formatted story
 * content, and a side panel with tribe facts (members, admins, privacy,
 * creation date, price) plus a join call to action for visitors.
 */
export function TribeStoryAbout({
  joinHref,
  offerPrice,
  stats,
  story,
  tribeName,
}: TribeStoryAboutProps) {
  return (
    <section className={styles.TribeStoryAbout}>
      <div className={styles.TribeStoryAbout__layout}>
        <article className={styles.TribeStoryAbout__main}>
          <header className={styles.TribeStoryAbout__header}>
            <h1 className={styles.TribeStoryAbout__title}>
              {TRIBE_STORY_ABOUT_COPY.title}
            </h1>
          </header>
          {story ? (
            <>
              <TribeStoryGallery media={story.media} />
              <RichStoryContent content={story.content} />
            </>
          ) : (
            <p className={styles.TribeStoryAbout__emptyState}>
              {TRIBE_STORY_ABOUT_COPY.emptyState}
            </p>
          )}
        </article>

        <aside
          aria-label={TRIBE_STORY_ABOUT_COPY.sidebarAriaLabel}
          className={styles.TribeStoryAbout__sidebar}
        >
          <h2 className={styles.TribeStoryAbout__tribeName}>{tribeName}</h2>
          <dl className={styles.TribeStoryAbout__facts}>
            {stats ? (
              <>
                <div className={styles.TribeStoryAbout__fact}>
                  <dt className={styles.TribeStoryAbout__factTerm}>
                    {TRIBE_STORY_ABOUT_COPY.membersLabel}
                  </dt>
                  <dd className={styles.TribeStoryAbout__factValue}>
                    {stats.memberCount}
                  </dd>
                </div>
                <div className={styles.TribeStoryAbout__fact}>
                  <dt className={styles.TribeStoryAbout__factTerm}>
                    {TRIBE_STORY_ABOUT_COPY.adminsLabel}
                  </dt>
                  <dd className={styles.TribeStoryAbout__factValue}>
                    {stats.adminCount}
                  </dd>
                </div>
                <div className={styles.TribeStoryAbout__fact}>
                  <dt className={styles.TribeStoryAbout__factTerm}>
                    {TRIBE_STORY_ABOUT_COPY.createdLabel}
                  </dt>
                  <dd className={styles.TribeStoryAbout__factValue}>
                    {formatCreatedAt(stats.createdAt)}
                  </dd>
                </div>
              </>
            ) : null}
            <div className={styles.TribeStoryAbout__fact}>
              <dt className={styles.TribeStoryAbout__factTerm}>
                {TRIBE_STORY_ABOUT_COPY.privacyLabel}
              </dt>
              <dd className={styles.TribeStoryAbout__factValue}>
                {TRIBE_STORY_ABOUT_COPY.privacyPrivate}
              </dd>
            </div>
            {offerPrice ? (
              <div className={styles.TribeStoryAbout__fact}>
                <dt className={styles.TribeStoryAbout__factTerm}>
                  {TRIBE_STORY_ABOUT_COPY.priceLabel}
                </dt>
                <dd className={styles.TribeStoryAbout__factValue}>
                  {formatOfferPrice(offerPrice)}
                </dd>
              </div>
            ) : null}
          </dl>
          {story?.websiteUrl ? (
            <a
              className={styles.TribeStoryAbout__websiteLink}
              href={story.websiteUrl}
              rel={ABOUT_LINK_REL}
              target={ABOUT_LINK_TARGET}
            >
              {TRIBE_STORY_ABOUT_COPY.websiteLabel}
            </a>
          ) : null}
          {joinHref ? (
            <div className={styles.TribeStoryAbout__joinAction}>
              <Button asChild>
                <Link href={joinHref}>
                  {TRIBE_STORY_ABOUT_COPY.joinButton}
                </Link>
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
