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
  heading: "Miembros",
  listLabel: "Lista de miembros",
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
  },
  subtitle: "Personas que forman parte de esta tribu.",
} as const;

const TRIBE_MEMBER_LIST_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const TRIBE_MEMBER_LIST_ATTRIBUTES = {
  headingId: "tribe-member-list-title",
  outlineBadgeVariant: "outline",
} as const;

const TRIBE_MEMBER_PRIVILEGED_ROLES = new Set<TribeMemberRole>([
  TRIBE_MEMBER_LIST_ROLE.guardian,
  TRIBE_MEMBER_LIST_ROLE.leader,
]);

type PrivilegedTribeMemberRole = keyof typeof TRIBE_MEMBER_LIST_COPY.roleLabel;

type TribeMemberListProps = {
  members: TribeMemberResult[];
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

export function TribeMemberList({ members }: TribeMemberListProps) {
  return (
    <section
      aria-labelledby={TRIBE_MEMBER_LIST_ATTRIBUTES.headingId}
      className={styles.TribeMemberList}
    >
      <header className={styles.TribeMemberList__header}>
        <div className={styles.TribeMemberList__headingGroup}>
          <h1
            className={styles.TribeMemberList__title}
            id={TRIBE_MEMBER_LIST_ATTRIBUTES.headingId}
          >
            {TRIBE_MEMBER_LIST_COPY.heading}
          </h1>
          <p className={styles.TribeMemberList__subtitle}>
            {TRIBE_MEMBER_LIST_COPY.subtitle}
          </p>
        </div>
      </header>

      {members.length === 0 ? (
        <p className={styles.TribeMemberList__empty}>
          {TRIBE_MEMBER_LIST_COPY.emptyDescription}
        </p>
      ) : (
        <ul
          aria-label={TRIBE_MEMBER_LIST_COPY.listLabel}
          className={styles.TribeMemberList__list}
        >
          {members.map((member) => (
            <li className={styles.TribeMemberList__item} key={member.id}>
              <Avatar className={styles.TribeMemberList__avatar}>
                {member.image ? (
                  <AvatarImage alt={member.name} src={member.image} />
                ) : null}
                <AvatarFallback>{member.avatarFallback}</AvatarFallback>
              </Avatar>
              <div className={styles.TribeMemberList__identity}>
                <p className={styles.TribeMemberList__name}>{member.name}</p>
                <TribeMemberRoleBadge role={member.role} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
