"use client";

import { Link } from "@/components/navigation/link";
import { Button } from "beez-ui";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

const ERROR_STATE_UI = {
  backdropAriaHidden: "true",
  homeButtonSize: "lg",
  outlineVariant: "outline",
  retryButtonSize: "lg",
} as const;

type ErrorStateProps = {
  description: string;
  eyebrow: string;
  homeLabel: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
};

export function ErrorState({
  description,
  eyebrow,
  homeLabel,
  onRetry,
  retryLabel,
  title,
}: ErrorStateProps) {
  return (
    <section className={styles.ErrorState}>
      <div
        className={styles.ErrorState__backdrop}
        aria-hidden={ERROR_STATE_UI.backdropAriaHidden}
      />
      <p className={styles.ErrorState__eyebrow}>{eyebrow}</p>
      <h1 className={styles.ErrorState__title}>{title}</h1>
      <p className={styles.ErrorState__description}>{description}</p>
      <div className={styles.ErrorState__actions}>
        <Button
          size={ERROR_STATE_UI.retryButtonSize}
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
        <Button
          asChild
          size={ERROR_STATE_UI.homeButtonSize}
          variant={ERROR_STATE_UI.outlineVariant}
        >
          <Link href={ROUTES.home}>{homeLabel}</Link>
        </Button>
      </div>
    </section>
  );
}
