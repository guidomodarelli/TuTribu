import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

export function TribeMemberList({
  canViewFreeInvitations = false,
  members,
  selectionsByMemberId,
}: TribeMemberListProps) {
  if (members.length === 0) {
    return (
      <p className={styles.TribeMemberList__empty}>
        {TRIBE_MEMBER_LIST_COPY.emptyDescription}
      </p>
    );
  }

  return (
    <ul
      aria-label={TRIBE_MEMBER_LIST_COPY.listLabel}
      className={styles.TribeMemberList__list}
    >
      {members.map((member, memberIndex) => {
        const memberSelections = selectionsByMemberId?.[member.id] ?? [];
        const memberPosition = memberIndex + FIRST_MEMBER_POSITION;
        const showFreeFrame =
          canViewFreeInvitations && member.joinedViaFreeInvitation;
        const avatar = (
          <Avatar className={styles.TribeMemberList__avatar}>
            {member.image ? (
              <AvatarImage alt={member.name} src={member.image} />
            ) : null}
            <AvatarFallback>{member.avatarFallback}</AvatarFallback>
          </Avatar>
        );

        return (
          <li className={styles.TribeMemberList__item} key={member.id}>
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
          </li>
        );
      })}
    </ul>
  );
}
