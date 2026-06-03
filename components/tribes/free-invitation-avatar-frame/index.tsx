import type { ReactNode } from "react";

import styles from "./styles.module.scss";

const FREE_INVITATION_AVATAR_FRAME = {
  /** Visible curved text rendered along the band. */
  ringText: "FREE",
  /** Accessible name announced for the whole frame (screen readers). */
  accessibleLabel: "Invitación free",
  ringRole: "img",
  textPathStartOffset: "50%",
  textAnchorMiddle: "middle",
  /**
   * Green ribbon on the lower-left of the avatar circle (120° centered on the
   * 45° diagonal, covering the bottom and left side). Clipped to the avatar
   * circle so it stays inside the image instead of extending beyond it.
   */
  ringArcPath: "M3.58 15.6 A17 17 0 0 0 24.4 36.42",
  /** Lower-left arc that keeps the curved text following the band. */
  textArcPath: "M2.13 15.21 A18.5 18.5 0 0 0 24.79 37.87",
  /** Avatar circle used to clip the band so it never spills outside the image. */
  clipCircle: { cx: 20, cy: 20, r: 20 },
  gradientIdPrefix: "free-ring-gradient-",
  textPathIdPrefix: "free-ring-text-",
  clipPathIdPrefix: "free-ring-clip-",
} as const;

type FreeInvitationAvatarFrameProps = {
  /** Stable unique id (e.g. member id) used to namespace SVG defs. */
  frameId: string;
  children: ReactNode;
};

/**
 * Wraps an avatar with a glossy green "Invitación free" ring inspired by the
 * LinkedIn open-to-work frame: an open-top arc around the avatar with curved
 * text along the bottom. Purely presentational and decorative; the accessible
 * name is exposed through the ring's `aria-label`.
 *
 * @param frameId - Stable unique identifier used to namespace the gradient and
 *   text-path ids so multiple frames can render on the same page.
 * @param children - The avatar element to frame.
 */
export function FreeInvitationAvatarFrame({
  frameId,
  children,
}: FreeInvitationAvatarFrameProps) {
  const gradientId = `${FREE_INVITATION_AVATAR_FRAME.gradientIdPrefix}${frameId}`;
  const textPathId = `${FREE_INVITATION_AVATAR_FRAME.textPathIdPrefix}${frameId}`;
  const clipPathId = `${FREE_INVITATION_AVATAR_FRAME.clipPathIdPrefix}${frameId}`;
  const { cx, cy, r } = FREE_INVITATION_AVATAR_FRAME.clipCircle;

  return (
    <div className={styles.FreeInvitationAvatarFrame}>
      {children}
      <svg
        aria-label={FREE_INVITATION_AVATAR_FRAME.accessibleLabel}
        className={styles.FreeInvitationAvatarFrame__ring}
        role={FREE_INVITATION_AVATAR_FRAME.ringRole}
        viewBox="0 0 40 40"
      >
        <title>{FREE_INVITATION_AVATAR_FRAME.accessibleLabel}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--free)" />
            <stop offset="100%" stopColor="var(--free-strong)" />
          </linearGradient>
          <path
            id={textPathId}
            d={FREE_INVITATION_AVATAR_FRAME.textArcPath}
            fill="none"
          />
          <clipPath id={clipPathId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipPathId})`}>
          <path
            className={styles.FreeInvitationAvatarFrame__arc}
            d={FREE_INVITATION_AVATAR_FRAME.ringArcPath}
            fill="none"
            stroke={`url(#${gradientId})`}
          />
          <text className={styles.FreeInvitationAvatarFrame__text}>
            <textPath
              href={`#${textPathId}`}
              startOffset={FREE_INVITATION_AVATAR_FRAME.textPathStartOffset}
              textAnchor={FREE_INVITATION_AVATAR_FRAME.textAnchorMiddle}
            >
              {FREE_INVITATION_AVATAR_FRAME.ringText}
            </textPath>
          </text>
        </g>
      </svg>
    </div>
  );
}
