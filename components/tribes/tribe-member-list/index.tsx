"use client";

import { AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage, Badge, AnimatedListItem, PresenceSwap } from "beez-ui";

import { FreeInvitationAvatarFrame } from "@/components/tribes/free-invitation-avatar-frame";
import type {
  TribeMemberResult,
  TribeMemberRole,
} from "@/src/modules/tribes/application/results/tribe-member-result";
import { isPrivilegedTribeMemberRole } from "@/src/modules/tribes/constants/tribe-member-role";
import styles from "./styles.module.scss";

const TRIBE_MEMBER_SELECTION_COUNT_COPY = {
  accessedPrefix: "Accedido",
  labelSeparator: " ",
  pluralUnit: "veces",
  singularUnit: "vez",
} as const;

const TRIBE_MEMBER_SELECTION_COUNT = {
  singular: 1,
} as const;

const FIRST_MEMBER_POSITION = 1;

/**
 * Above this many rows, filtering only fades rows in and out: measuring every
 * row for the reflow glide would cost more than it adds on long lists.
 */
const MEMBER_LIST_LAYOUT_ANIMATION_LIMIT = 40;

/** Presence keys for the region that swaps between the list and its empty state. */
const MEMBER_LIST_PRESENCE_KEY = {
  empty: "empty",
  list: "list",
} as const;

/** Decorative avatar alt: the member name is already rendered next to it. */
const DECORATIVE_IMAGE_ALT = "";

const POSITION_ATTRIBUTES = {
  ariaHidden: true,
} as const;

const TRIBE_MEMBER_LIST_COPY = {
  emptyDescription: "Todavía no hay miembros visibles en esta tribu.",
  listLabel: "Lista de miembros",
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
  },
  selectionCountAriaLabel: (count: number) => {
    const unitLabel =
      count === TRIBE_MEMBER_SELECTION_COUNT.singular
        ? TRIBE_MEMBER_SELECTION_COUNT_COPY.singularUnit
        : TRIBE_MEMBER_SELECTION_COUNT_COPY.pluralUnit;

    return [
      TRIBE_MEMBER_SELECTION_COUNT_COPY.accessedPrefix,
      count,
      unitLabel,
    ].join(TRIBE_MEMBER_SELECTION_COUNT_COPY.labelSeparator);
  },
  selectionListLabel: "Opciones elegidas por el miembro",
} as const;

const TRIBE_MEMBER_LIST_ATTRIBUTES = {
  outlineBadgeVariant: "outline",
} as const;

export type TribeMemberSelectionBadge = {
  count: number;
  id: string;
  label: string;
};

type TribeMemberListProps = {
  canViewFreeInvitations?: boolean;
  /** Overrides the empty copy, for example when a search or filter hides every member. */
  emptyDescription?: string;
  members: TribeMemberResult[];
  selectionsByMemberId?: Record<string, TribeMemberSelectionBadge[]>;
};

function TribeMemberRoleBadge({ role }: { role: TribeMemberRole }) {
  if (!isPrivilegedTribeMemberRole(role)) {
    return null;
  }

  return (
    <Badge
      className={`${styles.TribeMemberList__roleBadge} ${
        styles[`TribeMemberList__roleBadge--${role}`]
      }`}
      variant={TRIBE_MEMBER_LIST_ATTRIBUTES.outlineBadgeVariant}
    >
      {TRIBE_MEMBER_LIST_COPY.roleLabel[role]}
    </Badge>
  );
}

function TribeMemberSelectionBadges({
  selections,
}: {
  selections: TribeMemberSelectionBadge[];
}) {
  if (selections.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label={TRIBE_MEMBER_LIST_COPY.selectionListLabel}
      className={styles.TribeMemberList__selectionList}
    >
      {selections.map((selection) => {
        const countLabel = TRIBE_MEMBER_LIST_COPY.selectionCountAriaLabel(
          selection.count
        );

        return (
          <li
            className={styles.TribeMemberList__selectionItem}
            key={selection.id}
          >
            <Badge
              aria-label={`${selection.label}, ${countLabel}`}
              className={styles.TribeMemberList__selectionBadge}
              title={countLabel}
              variant={TRIBE_MEMBER_LIST_ATTRIBUTES.outlineBadgeVariant}
            >
              <span className={styles.TribeMemberList__selectionBadgeLabel}>
                {selection.label}
              </span>
              <span
                aria-hidden={true}
                className={styles.TribeMemberList__selectionBadgeSeparator}
              >
                ·
              </span>
              <span className={styles.TribeMemberList__selectionBadgeCount}>
                {selection.count}
              </span>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Numbered member rows with role and selection badges. Rows added or removed
 * after the first render (search, filters) fade in and out and the remaining
 * rows glide into place; the server-rendered list is shown as is.
 * @param props - Members to render, their selections and the empty copy.
 * @returns The member list, or a polite empty message.
 */
export function TribeMemberList({
  canViewFreeInvitations = false,
  emptyDescription = TRIBE_MEMBER_LIST_COPY.emptyDescription,
  members,
  selectionsByMemberId,
}: TribeMemberListProps) {
  const hasMembers = members.length > 0;
  const shouldAnimateLayout =
    members.length <= MEMBER_LIST_LAYOUT_ANIMATION_LIMIT;

  return (
    <PresenceSwap
      presenceKey={
        hasMembers ? MEMBER_LIST_PRESENCE_KEY.list : MEMBER_LIST_PRESENCE_KEY.empty
      }
    >
      {hasMembers ? (
        <ul
          aria-label={TRIBE_MEMBER_LIST_COPY.listLabel}
          className={styles.TribeMemberList__list}
        >
          <AnimatePresence initial={false}>
            {members.map((member, memberIndex) => {
              const memberSelections = selectionsByMemberId?.[member.id] ?? [];
              const memberPosition = memberIndex + FIRST_MEMBER_POSITION;
              const showFreeFrame =
                canViewFreeInvitations && member.joinedViaFreeInvitation;
              const avatar = (
                <Avatar className={styles.TribeMemberList__avatar}>
                  {member.image ? (
                    <AvatarImage alt={DECORATIVE_IMAGE_ALT} src={member.image} />
                  ) : null}
                  <AvatarFallback>{member.avatarFallback}</AvatarFallback>
                </Avatar>
              );

              return (
                <AnimatedListItem
                  as="li"
                  className={styles.TribeMemberList__item}
                  key={member.id}
                  layout={shouldAnimateLayout}
                >
                  <span
                    aria-hidden={POSITION_ATTRIBUTES.ariaHidden}
                    className={styles.TribeMemberList__position}
                  >
                    {memberPosition}
                  </span>
                  {showFreeFrame ? (
                    <FreeInvitationAvatarFrame frameId={member.id}>
                      {avatar}
                    </FreeInvitationAvatarFrame>
                  ) : (
                    avatar
                  )}
                  <div className={styles.TribeMemberList__identity}>
                    <div className={styles.TribeMemberList__memberDetails}>
                      <div className={styles.TribeMemberList__nameRow}>
                        <p className={styles.TribeMemberList__name}>{member.name}</p>
                        <TribeMemberRoleBadge role={member.role} />
                      </div>
                      {member.email ? (
                        <p className={styles.TribeMemberList__email}>{member.email}</p>
                      ) : null}
                    </div>
                    {memberSelections.length > 0 ? (
                      <div className={styles.TribeMemberList__sideBadges}>
                        <TribeMemberSelectionBadges selections={memberSelections} />
                      </div>
                    ) : null}
                  </div>
                </AnimatedListItem>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <p className={styles.TribeMemberList__empty} role="status">
          {emptyDescription}
        </p>
      )}
    </PresenceSwap>
  );
}
