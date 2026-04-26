import styles from "./styles.module.scss";

const COMING_SOON_SECTION_COPY = {
  description: "Esta sección está en construcción.",
  title: "Próximamente",
} as const;
const COMING_SOON_SECTION_ATTRIBUTES = {
  titleId: "coming-soon-section-title",
} as const;

type ComingSoonSectionProps = {
  heading: string;
};

export function ComingSoonSection({ heading }: ComingSoonSectionProps) {
  return (
    <main className={styles.ComingSoonSection}>
      <section
        className={styles.ComingSoonSection__content}
        aria-labelledby={COMING_SOON_SECTION_ATTRIBUTES.titleId}
      >
        <p className={styles.ComingSoonSection__eyebrow}>
          {COMING_SOON_SECTION_COPY.title}
        </p>
        <h1
          className={styles.ComingSoonSection__title}
          id={COMING_SOON_SECTION_ATTRIBUTES.titleId}
        >
          {heading}
        </h1>
        <p className={styles.ComingSoonSection__description}>
          {COMING_SOON_SECTION_COPY.description}
        </p>
      </section>
    </main>
  );
}
