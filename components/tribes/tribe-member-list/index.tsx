import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type {
  TribeMemberResult,
  TribeMemberRole,
} from "@/src/modules/tribes/application/results/tribe-member-result";
import styles from "./styles.module.scss";

const TRIBE_MEMBER_LIST_COPY = {
  emptyDescription: "Todavía no hay miembros visibles en esta tribu.",
  listLabel: "Lista de miembros",
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
  },
  selectionCountAriaLabel: (count: number) =>
    `Accedido ${count} ${count === 1 ? "vez" : "veces"}`,
  selectionListLabel: "Opciones elegidas por el miembro",
} as const;

const TRIBE_MEMBER_LIST_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const TRIBE_MEMBER_LIST_ATTRIBUTES = {
  outlineBadgeVariant: "outline",
} as const;

const TRIBE_MEMBER_PRIVILEGED_ROLES = new Set<TribeMemberRole>([
  TRIBE_MEMBER_LIST_ROLE.guardian,
  TRIBE_MEMBER_LIST_ROLE.leader,
]);

type PrivilegedTribeMemberRole = keyof typeof TRIBE_MEMBER_LIST_COPY.roleLabel;

export type TribeMemberSelectionBadge = {
  count: number;
  id: string;
  label: string;
};

type TribeMemberListProps = {
  members: TribeMemberResult[];
  selectionsByMemberId?: Record<string, TribeMemberSelectionBadge[]>;
};

function isPrivilegedTribeMemberRole(
  role: TribeMemberRole
): role is PrivilegedTribeMemberRole {
  return TRIBE_MEMBER_PRIVILEGED_ROLES.has(role);
}

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
      {selections.map((selection) => (
        <li className={styles.TribeMemberList__selectionItem} key={selection.id}>
          <Badge
            className={styles.TribeMemberList__selectionBadge}
            variant={TRIBE_MEMBER_LIST_ATTRIBUTES.outlineBadgeVariant}
          >
            <span className={styles.TribeMemberList__selectionBadgeLabel}>
              {selection.label}
            </span>
            <span
              aria-label={TRIBE_MEMBER_LIST_COPY.selectionCountAriaLabel(
                selection.count
              )}
              className={styles.TribeMemberList__selectionBadgeCount}
            >
              {selection.count}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function TribeMemberList({
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
      {members.map((member) => {
        const memberSelections = selectionsByMemberId?.[member.id] ?? [];

        return (
          <li className={styles.TribeMemberList__item} key={member.id}>
            <Avatar className={styles.TribeMemberList__avatar}>
              {member.image ? (
                <AvatarImage alt={member.name} src={member.image} />
              ) : null}
              <AvatarFallback>{member.avatarFallback}</AvatarFallback>
            </Avatar>
            <div className={styles.TribeMemberList__identity}>
              <div className={styles.TribeMemberList__memberDetails}>
                <p className={styles.TribeMemberList__name}>{member.name}</p>
                <p className={styles.TribeMemberList__email}>{member.email}</p>
              </div>
              <div className={styles.TribeMemberList__badges}>
                <TribeMemberRoleBadge role={member.role} />
                <TribeMemberSelectionBadges selections={memberSelections} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
