"use client";

import { DownloadIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { ButtonLink } from "@/components/navigation/link";
import {
  TribeMemberList,
  type TribeMemberSelectionBadge,
} from "@/components/tribes/tribe-member-list";
import { Button, DropdownMenu, Input, cn } from "@golfo/ui";

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
  triggerVariant: "secondary",
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
  activeVariant: "primary",
  buttonType: "button",
  inactiveVariant: "secondary",
  size: BUTTON_SIZE.small,
} as const;

const EMPTY_FILTER_COUNT = 0;

/** Unicode form that splits accented letters into base letter plus combining mark. */
const SEARCH_NORMALIZATION_FORM = "NFD";

/** Combining diacritical marks removed so "jose" matches "José". */
const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

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

/**
 * Lists the filters the viewer can use: all and pending only with selection
 * filters, and free members only for viewers who see free invitations.
 * @param filterOptions - Selection filters of the tribe.
 * @param hasSelectionFilters - Whether the tribe has selection filters.
 * @param canViewFreeInvitations - Whether the viewer sees free invitations.
 * @returns The ordered filters.
 */
function buildAvailableFilters(
  filterOptions: TribeMemberFilterOption[],
  hasSelectionFilters: boolean,
  canViewFreeInvitations: boolean
): TribeMemberFilterOption[] {
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
}

type TribeMemberFilterButtonProps = {
  count: number;
  filter: TribeMemberFilterOption;
  isActive: boolean;
  onSelect: (filterId: string) => void;
};

/**
 * Filter toggle with its member count.
 * @param props - Filter, its count, whether it is active and the select handler.
 * @returns The filter list item.
 */
function TribeMemberFilterButton({
  count,
  filter,
  isActive,
  onSelect,
}: TribeMemberFilterButtonProps) {
  const isFreeFilter = filter.id === FILTER_ID.free;
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
    >
      <Button
        aria-pressed={isActive}
        className={filterButtonClasses}
        onClick={() => onSelect(filter.id)}
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
}

type TribeMemberExportMenuProps = {
  disabled: boolean;
  onExport: (format: MemberExportFormat) => void;
};

/**
 * Menu that exports the listed members as CSV or HTML.
 * @param props - Whether the trigger is disabled and the export handler.
 * @returns The export dropdown menu.
 */
function TribeMemberExportMenu({ disabled, onExport }: TribeMemberExportMenuProps) {
  return (
    <DropdownMenu
      align={EXPORT_MENU.align}
      items={[
        {
          label: TRIBE_MEMBER_DIRECTORY_COPY.exportCsvLabel,
          onSelect: () => onExport(MEMBER_EXPORT_FORMAT.csv),
        },
        {
          label: TRIBE_MEMBER_DIRECTORY_COPY.exportHtmlLabel,
          onSelect: () => onExport(MEMBER_EXPORT_FORMAT.html),
        },
      ]}
      label={TRIBE_MEMBER_DIRECTORY_COPY.exportMenuLabel}
      side={EXPORT_MENU.side}
      trigger={
        <Button
          className={styles.TribeMemberDirectory__exportTrigger}
          disabled={disabled}
          size={BUTTON_SIZE.small}
          variant={EXPORT_BUTTON.triggerVariant}
        >
          <DownloadIcon
            aria-hidden={EXPORT_BUTTON.iconAriaHidden}
            className={styles.TribeMemberDirectory__exportTriggerIcon}
          />
          {TRIBE_MEMBER_DIRECTORY_COPY.exportTriggerLabel}
        </Button>
      }
    />
  );
}

type TribeMemberDirectoryHeaderProps = {
  canExportMembers: boolean;
  canInviteMembers: boolean;
  invitationsHref: string;
  isExportDisabled: boolean;
  onExport: (format: MemberExportFormat) => void;
};

/**
 * Title of the directory with the export menu and the invite call to action.
 * @param props - Permissions, export state and the invitations link.
 * @returns The directory header.
 */
function TribeMemberDirectoryHeader({
  canExportMembers,
  canInviteMembers,
  invitationsHref,
  isExportDisabled,
  onExport,
}: TribeMemberDirectoryHeaderProps) {
  return (
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
          <TribeMemberExportMenu
            disabled={isExportDisabled}
            onExport={onExport}
          />
        ) : null}
        {canInviteMembers ? (
          <ButtonLink className={styles.TribeMemberDirectory__inviteCta} href={invitationsHref} size="sm">
            {TRIBE_MEMBER_DIRECTORY_COPY.inviteCtaLabel}
          </ButtonLink>
        ) : null}
      </div>
    </header>
  );
}

type TribeMemberFilterListProps = {
  activeFilterId: string;
  filters: TribeMemberFilterOption[];
  members: TribeMemberResult[];
  onSelect: (filterId: string) => void;
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>;
};

/**
 * Filter toggles, each with the count of members it keeps.
 * @param props - Filters, the active one and the members they count.
 * @returns The filter list.
 */
function TribeMemberFilterList({
  activeFilterId,
  filters,
  members,
  onSelect,
  selectionsByMemberId,
}: TribeMemberFilterListProps) {
  return (
    <ul
      aria-label={TRIBE_MEMBER_DIRECTORY_COPY.filterListLabel}
      className={styles.TribeMemberDirectory__filterList}
    >
      {filters.map((filter) => {
        const isActive = filter.id === activeFilterId;
        const count = filterMembers(
          members,
          selectionsByMemberId,
          filter.id
        ).length;

        return (
          <TribeMemberFilterButton
            count={count}
            filter={filter}
            isActive={isActive}
            key={filter.id}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}

/**
 * Downloads the listed members as CSV or HTML.
 * @param format - Export format.
 * @param members - Members to export.
 * @param selectionsByMemberId - Selections of each member.
 * @param tribeSlug - Tribe slug, used in the file name.
 */
function exportMembers(
  format: MemberExportFormat,
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>,
  tribeSlug: string
) {
  const content =
    format === MEMBER_EXPORT_FORMAT.csv
      ? buildMembersCsv(members, selectionsByMemberId)
      : buildMembersHtml(members, selectionsByMemberId, tribeSlug);
  const filename = buildMembersExportFilename(tribeSlug, format);

  downloadTextFile(content, filename, MEMBER_EXPORT_MIME_TYPE[format]);
}

type MemberDirectoryFiltersOptions = Pick<
  TribeMemberDirectoryProps,
  "filterOptions" | "members" | "selectionsByMemberId"
> & {
  canViewFreeInvitations: boolean;
};

/**
 * Search and filter state of the directory. A filter that stops being
 * available falls back to every member.
 * @param options - Members, their selections and the filter options.
 * @returns Available filters, the resolved active one, the search query and
 * the members that match both.
 */
function useMemberDirectoryFilters({
  canViewFreeInvitations,
  filterOptions,
  members,
  selectionsByMemberId,
}: MemberDirectoryFiltersOptions) {
  const [activeFilterId, setActiveFilterId] = useState<string>(FILTER_ID.all);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const hasSelectionFilters = filterOptions.length > 0;
  const availableFilters = useMemo<TribeMemberFilterOption[]>(
    () =>
      buildAvailableFilters(
        filterOptions,
        hasSelectionFilters,
        canViewFreeInvitations
      ),
    [canViewFreeInvitations, filterOptions, hasSelectionFilters]
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
  return {
    availableFilters,
    filteredMembers,
    hasNarrowedMembers:
      searchQuery.trim().length > 0 || resolvedActiveFilterId !== FILTER_ID.all,
    resolvedActiveFilterId,
    searchQuery,
    setActiveFilterId,
    setSearchQuery,
  };
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
  const directoryFilters = useMemberDirectoryFilters({
    canViewFreeInvitations,
    filterOptions,
    members,
    selectionsByMemberId,
  });
  const { availableFilters, filteredMembers, resolvedActiveFilterId } =
    directoryFilters;
  const searchInputId = useId();
  const canSearchByEmail = useMemo(
    () => members.some((member) => member.email !== null),
    [members]
  );
  const searchPlaceholder = canSearchByEmail
    ? TRIBE_MEMBER_DIRECTORY_COPY.searchPlaceholderWithEmail
    : TRIBE_MEMBER_DIRECTORY_COPY.searchPlaceholderWithoutEmail;
  const showFilters = availableFilters.length > 0;
  const canExportFilteredMembers = filteredMembers.length > 0;
  const invitationsHref = `${INVITATIONS_PATH_PREFIX}${tribeSlug}${INVITATIONS_PATH_SUFFIX}`;

  const handleExport = (format: MemberExportFormat) => {
    exportMembers(format, filteredMembers, selectionsByMemberId, tribeSlug);
  };

  return (
    <section
      aria-labelledby={TRIBE_MEMBER_DIRECTORY_COPY.headingId}
      className={styles.TribeMemberDirectory}
    >
      <TribeMemberDirectoryHeader
        canExportMembers={canExportMembers}
        canInviteMembers={canInviteMembers}
        isExportDisabled={!canExportFilteredMembers}
        invitationsHref={invitationsHref}
        onExport={handleExport}
      />

      <div className={styles.TribeMemberDirectory__body}>
        <Input
          aria-label={TRIBE_MEMBER_DIRECTORY_COPY.searchLabel}
          className={styles.TribeMemberDirectory__searchInput}
          id={searchInputId}
          onChange={(event) => directoryFilters.setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          type={SEARCH_INPUT_TYPE}
          value={directoryFilters.searchQuery}
        />

        {showFilters ? (
          <TribeMemberFilterList
            activeFilterId={resolvedActiveFilterId}
            filters={availableFilters}
            members={members}
            onSelect={directoryFilters.setActiveFilterId}
            selectionsByMemberId={selectionsByMemberId}
          />
        ) : null}

        <TribeMemberList
          canViewFreeInvitations={canViewFreeInvitations}
          emptyDescription={
            directoryFilters.hasNarrowedMembers
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
