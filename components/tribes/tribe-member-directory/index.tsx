"use client";

import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  TribeMemberList,
  type TribeMemberSelectionBadge,
} from "@/components/tribes/tribe-member-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";
import {
  buildMembersCsv,
  buildMembersExportFilename,
  buildMembersHtml,
  downloadTextFile,
  MEMBER_EXPORT_FORMAT,
  MEMBER_EXPORT_MIME_TYPE,
  type MemberExportFormat,
} from "./export";
import styles from "./styles.module.scss";

const TRIBE_MEMBER_DIRECTORY_COPY = {
  allFilterLabel: "Todos",
  exportCsvLabel: "Exportar a CSV",
  exportHtmlLabel: "Exportar a HTML",
  exportMenuLabel: "Elegir formato de exportación",
  exportTriggerLabel: "Exportar",
  filterListLabel: "Filtrar miembros por elección",
  headingId: "tribe-member-directory-title",
  inviteCtaLabel: "Invitar miembro",
  pendingFilterLabel: "Sin elegir",
  searchLabel: "Buscar miembro",
  searchPlaceholderWithEmail: "Buscar por nombre o email",
  searchPlaceholderWithoutEmail: "Buscar por nombre",
  subtitle: "Personas que forman parte de esta tribu.",
  title: "Miembros",
} as const;

const EXPORT_BUTTON = {
  iconAriaHidden: true,
  triggerVariant: "outline",
} as const;

const EXPORT_MENU = {
  align: "end",
  side: "bottom",
} as const;

const SEARCH_INPUT_TYPE = "search";

const FILTER_ID = {
  all: "all",
  pending: "pending",
} as const;

const BUTTON_SIZE = {
  small: "sm",
} as const;

const FILTER_BUTTON = {
  activeVariant: "default",
  buttonType: "button",
  inactiveVariant: "outline",
  size: BUTTON_SIZE.small,
} as const;

const EMPTY_FILTER_COUNT = 0;

const INVITATIONS_PATH_PREFIX = "/";
const INVITATIONS_PATH_SUFFIX = "/invitaciones";

type TribeMemberFilterOption = {
  id: string;
  label: string;
};

type TribeMemberDirectoryProps = {
  canExportMembers: boolean;
  canInviteMembers: boolean;
  filterOptions: TribeMemberFilterOption[];
  members: TribeMemberResult[];
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>;
  tribeSlug: string;
};

function countMembersForFilter(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>,
  filterId: string
): number {
  if (filterId === FILTER_ID.all) {
    return members.length;
  }

  if (filterId === FILTER_ID.pending) {
    return members.filter(
      (member) => (selectionsByMemberId[member.id] ?? []).length === 0
    ).length;
  }

  return members.filter((member) =>
    (selectionsByMemberId[member.id] ?? []).some(
      (selection) => selection.id === filterId
    )
  ).length;
}

function filterMembers(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>,
  filterId: string
): TribeMemberResult[] {
  if (filterId === FILTER_ID.all) {
    return members;
  }

  if (filterId === FILTER_ID.pending) {
    return members.filter(
      (member) => (selectionsByMemberId[member.id] ?? []).length === 0
    );
  }

  return members.filter((member) =>
    (selectionsByMemberId[member.id] ?? []).some(
      (selection) => selection.id === filterId
    )
  );
}

function searchMembers(
  members: TribeMemberResult[],
  query: string
): TribeMemberResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return members;
  }

  return members.filter((member) => {
    const nameMatch = member.name.toLowerCase().includes(normalizedQuery);
    const emailMatch = member.email
      ? member.email.toLowerCase().includes(normalizedQuery)
      : false;

    return nameMatch || emailMatch;
  });
}

export function TribeMemberDirectory({
  canExportMembers,
  canInviteMembers,
  filterOptions,
  members,
  selectionsByMemberId,
  tribeSlug,
}: TribeMemberDirectoryProps) {
  const [activeFilterId, setActiveFilterId] = useState<string>(FILTER_ID.all);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchInputId = useId();
  const availableFilters = useMemo<TribeMemberFilterOption[]>(
    () => [
      { id: FILTER_ID.all, label: TRIBE_MEMBER_DIRECTORY_COPY.allFilterLabel },
      {
        id: FILTER_ID.pending,
        label: TRIBE_MEMBER_DIRECTORY_COPY.pendingFilterLabel,
      },
      ...filterOptions,
    ],
    [filterOptions]
  );
  const isActiveFilterAvailable = availableFilters.some(
    (filter) => filter.id === activeFilterId
  );
  const resolvedActiveFilterId = isActiveFilterAvailable
    ? activeFilterId
    : FILTER_ID.all;

  const filteredMembers = useMemo(() => {
    const matchingSearchMembers = searchMembers(members, searchQuery);

    return filterMembers(
      matchingSearchMembers,
      selectionsByMemberId,
      resolvedActiveFilterId
    );
  }, [members, resolvedActiveFilterId, searchQuery, selectionsByMemberId]);
  const canSearchByEmail = useMemo(
    () => members.some((member) => member.email !== null),
    [members]
  );
  const searchPlaceholder = canSearchByEmail
    ? TRIBE_MEMBER_DIRECTORY_COPY.searchPlaceholderWithEmail
    : TRIBE_MEMBER_DIRECTORY_COPY.searchPlaceholderWithoutEmail;
  const showFilters = filterOptions.length > 0;
  const invitationsHref = `${INVITATIONS_PATH_PREFIX}${tribeSlug}${INVITATIONS_PATH_SUFFIX}`;

  const handleExport = (format: MemberExportFormat) => {
    const content =
      format === MEMBER_EXPORT_FORMAT.csv
        ? buildMembersCsv(filteredMembers, selectionsByMemberId)
        : buildMembersHtml(filteredMembers, selectionsByMemberId, tribeSlug);
    const filename = buildMembersExportFilename(tribeSlug, format);

    downloadTextFile(content, filename, MEMBER_EXPORT_MIME_TYPE[format]);
  };

  return (
    <section
      aria-labelledby={TRIBE_MEMBER_DIRECTORY_COPY.headingId}
      className={styles.TribeMemberDirectory}
    >
      <header className={styles.TribeMemberDirectory__header}>
        <div className={styles.TribeMemberDirectory__headingGroup}>
          <h1
            className={styles.TribeMemberDirectory__title}
            id={TRIBE_MEMBER_DIRECTORY_COPY.headingId}
          >
            {TRIBE_MEMBER_DIRECTORY_COPY.title}
          </h1>
          <p className={styles.TribeMemberDirectory__subtitle}>
            {TRIBE_MEMBER_DIRECTORY_COPY.subtitle}
          </p>
        </div>
        <div className={styles.TribeMemberDirectory__headerActions}>
          {canExportMembers ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className={styles.TribeMemberDirectory__exportTrigger}
                  size={BUTTON_SIZE.small}
                  variant={EXPORT_BUTTON.triggerVariant}
                >
                  <DownloadIcon
                    aria-hidden={EXPORT_BUTTON.iconAriaHidden}
                    className={styles.TribeMemberDirectory__exportTriggerIcon}
                  />
                  {TRIBE_MEMBER_DIRECTORY_COPY.exportTriggerLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={EXPORT_MENU.align}
                aria-label={TRIBE_MEMBER_DIRECTORY_COPY.exportMenuLabel}
                side={EXPORT_MENU.side}
              >
                <DropdownMenuItem
                  onSelect={() => handleExport(MEMBER_EXPORT_FORMAT.csv)}
                >
                  {TRIBE_MEMBER_DIRECTORY_COPY.exportCsvLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleExport(MEMBER_EXPORT_FORMAT.html)}
                >
                  {TRIBE_MEMBER_DIRECTORY_COPY.exportHtmlLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canInviteMembers ? (
            <Button
              asChild
              className={styles.TribeMemberDirectory__inviteCta}
              size={BUTTON_SIZE.small}
            >
              <Link href={invitationsHref}>
                {TRIBE_MEMBER_DIRECTORY_COPY.inviteCtaLabel}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <Input
        aria-label={TRIBE_MEMBER_DIRECTORY_COPY.searchLabel}
        className={styles.TribeMemberDirectory__searchInput}
        id={searchInputId}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={searchPlaceholder}
        type={SEARCH_INPUT_TYPE}
        value={searchQuery}
      />

      {showFilters ? (
        <ul
          aria-label={TRIBE_MEMBER_DIRECTORY_COPY.filterListLabel}
          className={styles.TribeMemberDirectory__filterList}
        >
          {availableFilters.map((filter) => {
            const isActive = filter.id === resolvedActiveFilterId;
            const count = countMembersForFilter(
              members,
              selectionsByMemberId,
              filter.id
            );
            const isEmptyCount = count === EMPTY_FILTER_COUNT && !isActive;
            const filterButtonClasses = [
              styles.TribeMemberDirectory__filterButton,
              isEmptyCount
                ? styles["TribeMemberDirectory__filterButton--empty"]
                : null,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li
                className={styles.TribeMemberDirectory__filterItem}
                key={filter.id}
              >
                <Button
                  className={filterButtonClasses}
                  onClick={() => setActiveFilterId(filter.id)}
                  size={FILTER_BUTTON.size}
                  type={FILTER_BUTTON.buttonType}
                  variant={
                    isActive
                      ? FILTER_BUTTON.activeVariant
                      : FILTER_BUTTON.inactiveVariant
                  }
                >
                  {filter.label} ({count})
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <TribeMemberList
        members={filteredMembers}
        selectionsByMemberId={selectionsByMemberId}
      />
    </section>
  );
}
