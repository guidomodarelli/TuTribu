import Image from "next/image";

import { Link } from "@/components/navigation/link";
import { Button } from "beez-ui";
import { RichStoryContent } from "@/components/rich-text/rich-story-content";
import { TribeStoryGallery } from "@/components/tribes/tribe-story-gallery";
import type {
  TribeStoryResult,
  TribeStoryStatsResult,
} from "@/src/modules/tribes/application/results/tribe-story-result";
import type { TribeStoryOnlineMember } from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import styles from "./styles.module.scss";

const TRIBE_STORY_ABOUT_COPY = {
  adminsLabel: "Administradores",
  coverAlt: (tribeName: string) => `Portada de ${tribeName}`,
  createdLabel: "Creada en",
  emptyState: "El líder todavía no escribió la historia de la tribu.",
  freeJoinButton: "Unirse gratis",
  joinButton: "Unirse a la tribu",
  logoAlt: (tribeName: string) => `Logo de ${tribeName}`,
  membersLabel: "Miembros",
  onlineLabel: "En línea",
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
const ABOUT_COVER_SIZES = "(min-width: 64rem) 42rem, 100vw";
const ABOUT_LOGO_SIZE = 56;

export type TribeStoryAboutOfferPrice = {
  amountCents: number;
  currency: string;
};

const ABOUT_TITLE_HEADING_TAG = {
  primary: "h1",
  secondary: "h2",
} as const;

type TribeStoryAboutProps = {
  freeJoinAction?: () => Promise<void>;
  /**
   * Heading level of the "Historia" title. The public page uses the primary
   * (`h1`) level; an embedded preview inside another page passes `secondary`
   * so the host page keeps a single `h1`.
   */
  headingLevel?: keyof typeof ABOUT_TITLE_HEADING_TAG;
  joinHref?: string;
  offerPrice: TribeStoryAboutOfferPrice | null;
  onlineMembers?: TribeStoryOnlineMember[];
  stats: TribeStoryStatsResult | null;
  story: TribeStoryResult | null;
  tribeName: string;
};

const ONLINE_AVATAR_SIZE = 28;
const ONLINE_INITIALS_MAX_PARTS = 2;

function buildOnlineMemberInitials(memberName: string): string {
  return memberName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, ONLINE_INITIALS_MAX_PARTS)
    .map((namePart) => namePart[0]?.toUpperCase() ?? "")
    .join("");
}

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
 * Read-only "About" view of the tribe story: cover, media gallery, formatted
 * story content, and a side panel with the tribe identity (logo, name) and
 * facts (members, online, admins, privacy, creation date, price) plus a join
 * call to action for visitors — a free-join form when the tribe allows
 * tokenless free joins, or a link to the paid checkout page otherwise.
 */
export function TribeStoryAbout({
  freeJoinAction,
  headingLevel = "primary",
  joinHref,
  offerPrice,
  onlineMembers = [],
  stats,
  story,
  tribeName,
}: TribeStoryAboutProps) {
  const TitleTag = ABOUT_TITLE_HEADING_TAG[headingLevel];

  return (
    <section className={styles.TribeStoryAbout}>
      {stats?.coverUrl ? (
        <div className={styles.TribeStoryAbout__cover}>
          <Image
            alt={TRIBE_STORY_ABOUT_COPY.coverAlt(tribeName)}
            className={styles.TribeStoryAbout__coverImage}
            fill
            sizes={ABOUT_COVER_SIZES}
            src={stats.coverUrl}
            unoptimized
          />
        </div>
      ) : null}
      <div className={styles.TribeStoryAbout__layout}>
        <article className={styles.TribeStoryAbout__main}>
          <header className={styles.TribeStoryAbout__header}>
            <TitleTag className={styles.TribeStoryAbout__title}>
              {TRIBE_STORY_ABOUT_COPY.title}
            </TitleTag>
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
          <div className={styles.TribeStoryAbout__identity}>
            {stats?.logoUrl ? (
              <Image
                alt={TRIBE_STORY_ABOUT_COPY.logoAlt(tribeName)}
                className={styles.TribeStoryAbout__logo}
                height={ABOUT_LOGO_SIZE}
                src={stats.logoUrl}
                unoptimized
                width={ABOUT_LOGO_SIZE}
              />
            ) : null}
            <h2 className={styles.TribeStoryAbout__tribeName}>{tribeName}</h2>
          </div>
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
                    {TRIBE_STORY_ABOUT_COPY.onlineLabel}
                  </dt>
                  <dd className={styles.TribeStoryAbout__factValue}>
                    {stats.onlineCount}
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
          {onlineMembers.length > 0 ? (
            <ul className={styles.TribeStoryAbout__onlineMembers}>
              {onlineMembers.map((onlineMember, onlineMemberIndex) => (
                <li
                  className={styles.TribeStoryAbout__onlineMember}
                  key={onlineMember.name + String(onlineMemberIndex)}
                  title={onlineMember.name}
                >
                  {onlineMember.image ? (
                    <Image
                      alt={onlineMember.name}
                      className={styles.TribeStoryAbout__onlineAvatar}
                      height={ONLINE_AVATAR_SIZE}
                      src={onlineMember.image}
                      unoptimized
                      width={ONLINE_AVATAR_SIZE}
                    />
                  ) : (
                    <span className={styles.TribeStoryAbout__onlineInitials}>
                      {buildOnlineMemberInitials(onlineMember.name)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
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
          {freeJoinAction ? (
            <form
              action={freeJoinAction}
              className={styles.TribeStoryAbout__joinAction}
            >
              <Button type="submit">
                {TRIBE_STORY_ABOUT_COPY.freeJoinButton}
              </Button>
            </form>
          ) : joinHref ? (
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
