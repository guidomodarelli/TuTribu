import type { HTMLAttributes } from "react";
import styles from "./styles.module.scss";

const DEFAULT_LOADING_LABEL = "Cargando...";
const DEFAULT_SIZE: BouncingDotsLoaderSize = "md";

type BouncingDotsLoaderSize = "sm" | "md";

type BouncingDotsLoaderProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "role"
> & {
  /**
   * Accessible label announced by assistive technologies. Also rendered as
   * visually-hidden text so screen readers can read it independently of the
   * `aria-label`.
   */
  label?: string;
  /**
   * Visual size of the loader. Use `"sm"` for inline/compact contexts and
   * `"md"` (default) for standalone loading panels.
   */
  size?: BouncingDotsLoaderSize;
};

/**
 * Animated three-dot bouncing loader with synchronized shadows.
 *
 * Renders a presentational animation only. Pair it with an accessible label
 * (defaults to a Spanish "Cargando..." copy) so the loading state is exposed
 * via `role="status"` to assistive technologies.
 *
 * Honors `prefers-reduced-motion` by suppressing the keyframe animations.
 */
export function BouncingDotsLoader({
  label = DEFAULT_LOADING_LABEL,
  size = DEFAULT_SIZE,
  className,
  ...rest
}: BouncingDotsLoaderProps) {
  const sizeModifierClassName = styles[`BouncingDotsLoader--${size}`];
  const containerClassName = [
    styles.BouncingDotsLoader,
    sizeModifierClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...rest}
      aria-label={label}
      className={containerClassName}
      role="status"
    >
      <div aria-hidden="true" className={styles.BouncingDotsLoader__stage}>
        <span className={styles.BouncingDotsLoader__dot} />
        <span
          className={`${styles.BouncingDotsLoader__dot} ${styles["BouncingDotsLoader__dot--middle"]}`}
        />
        <span
          className={`${styles.BouncingDotsLoader__dot} ${styles["BouncingDotsLoader__dot--right"]}`}
        />
        <span className={styles.BouncingDotsLoader__shadow} />
        <span
          className={`${styles.BouncingDotsLoader__shadow} ${styles["BouncingDotsLoader__shadow--middle"]}`}
        />
        <span
          className={`${styles.BouncingDotsLoader__shadow} ${styles["BouncingDotsLoader__shadow--right"]}`}
        />
      </div>
      <span className={styles.BouncingDotsLoader__srOnly}>{label}</span>
    </div>
  );
}
