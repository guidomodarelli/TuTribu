"use client";

import { DownloadIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Link } from "@/components/navigation/link";
import {
  TribeMemberList,
  type TribeMemberSelectionBadge,
} from "@/components/tribes/tribe-member-list";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, cn } from "beez-ui";

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
  freeFilterLabel: "Invitación free",
  exportHtmlLabel: "Exportar a HTML",
  exportMenuLabel: "Elegir formato de exportación",
  exportTriggerLabel: "Exportar",
  filterListLabel: "Filtrar miembros por elección",
  headingId: "tribe-member-directory-title",
  inviteCtaLabel: "Invitar miembro",
  noMatchesDescription: "Ningún miembro coincide con la búsqueda o el filtro elegido.",
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
  free: "free",
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

/** Unicode form that splits accented letters into base letter plus combining mark. */
const SEARCH_NORMALIZATION_FORM = "NFD";

/** Combining diacritical marks removed so "jose" matches "José". */
const COMBINING_DIACRITICS_PATTERN = /[̀-ͯ]/g;

const INVITATIONS_PATH_PREFIX = "/";
const INVITATIONS_PATH_SUFFIX = "/invitaciones";

type TribeMemberFilterOption = {
  id: string;
  label: string;
};

type TribeMemberDirectoryProps = {
  canExportMembers: boolean;
  canInviteMembers: boolean;
  canViewFreeInvitations?: boolean;
  filterOptions: TribeMemberFilterOption[];
  members: TribeMemberResult[];
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>;
  tribeSlug: string;
};

function filterMembers(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>,
  filterId: string
): TribeMemberResult[] {
  if (filterId === FILTER_ID.all) {
    return members;
  }

  if (filterId === FILTER_ID.free) {
    return members.filter((member) => member.joinedViaFreeInvitation);
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

/**
 * Normalizes text for search: lower case and without accents.
 * @param value - Raw text.
 * @returns The comparable form of the text.
 */
function normalizeSearchText(value: string): string {
  return value
    .normalize(SEARCH_NORMALIZATION_FORM)
    .replace(COMBINING_DIACRITICS_PATTERN, "")
    .toLowerCase();
}

/**
 * Filters members whose name or visible email contains the query, ignoring
 * case and accents.
 * @param members - Members to search.
 * @param query - Raw search input.
 * @returns The matching members, or every member for an empty query.
 */
function searchMembers(
  members: TribeMemberResult[],
  query: string
): TribeMemberResult[] {
  const normalizedQuery = normalizeSearchText(query.trim());

  if (normalizedQuery.length === 0) {
    return members;
  }

  return members.filter((member) => {
    const nameMatch = normalizeSearchText(member.name).includes(normalizedQuery);
    const emailMatch = member.email
      ? normalizeSearchText(member.email).includes(normalizedQuery)
      : false;

    return nameMatch || emailMatch;
  });
}

export function TribeMemberDirectory({
  canExportMembers,
  canInviteMembers,
  canViewFreeInvitations = false,
  filterOptions,
  members,
  selectionsByMemberId,
  tribeSlug,
}: TribeMemberDirectoryProps) {
  const [activeFilterId, setActiveFilterId] = useState<string>(FILTER_ID.all);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchInputId = useId();
  const hasSelectionFilters = filterOptions.length > 0;
  const availableFilters = useMemo<TribeMemberFilterOption[]>(() => {
    const filters: TribeMemberFilterOption[] = [];

    if (hasSelectionFilters || canViewFreeInvitations) {
      filters.push({
        id: FILTER_ID.all,
        label: TRIBE_MEMBER_DIRECTORY_COPY.allFilterLabel,
      });
    }

    if (hasSelectionFilters) {
      filters.push(
        {
          id: FILTER_ID.pending,
          label: TRIBE_MEMBER_DIRECTORY_COPY.pendingFilterLabel,
        },
        ...filterOptions
      );
    }

    if (canViewFreeInvitations) {
      filters.push({
        id: FILTER_ID.free,
        label: TRIBE_MEMBER_DIRECTORY_COPY.freeFilterLabel,
      });
    }

    return filters;
  }, [canViewFreeInvitations, filterOptions, hasSelectionFilters]);
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
  const showFilters = availableFilters.length > 0;
  const hasNarrowedMembers =
    searchQuery.trim().length > 0 || resolvedActiveFilterId !== FILTER_ID.all;
  const canExportFilteredMembers = filteredMembers.length > 0;
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
                  disabled={!canExportFilteredMembers}
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

      <div className={styles.TribeMemberDirectory__body}>
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
              const isFreeFilter = filter.id === FILTER_ID.free;
              const count = filterMembers(
                members,
                selectionsByMemberId,
                filter.id
              ).length;
              const isEmptyCount = count === EMPTY_FILTER_COUNT && !isActive;
              const filterButtonClasses = cn(
                styles.TribeMemberDirectory__filterButton,
                isFreeFilter && styles["TribeMemberDirectory__filterButton--free"],
                isFreeFilter &&
                  isActive &&
                  styles["TribeMemberDirectory__filterButton--freeActive"],
                isEmptyCount && styles["TribeMemberDirectory__filterButton--empty"]
              );

              return (
                <li
                  className={styles.TribeMemberDirectory__filterItem}
                  key={filter.id}
                >
                  <Button
                    aria-pressed={isActive}
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
                    {isFreeFilter ? (
                      <span
                        aria-hidden={true}
                        className={styles.TribeMemberDirectory__filterDot}
                      />
                    ) : null}
                    {filter.label} ({count})
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <TribeMemberList
          canViewFreeInvitations={canViewFreeInvitations}
          emptyDescription={
            hasNarrowedMembers
              ? TRIBE_MEMBER_DIRECTORY_COPY.noMatchesDescription
              : undefined
          }
          members={filteredMembers}
          selectionsByMemberId={selectionsByMemberId}
        />
      </div>
    </section>
  );
}
