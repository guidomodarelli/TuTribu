"use client";

import { useMemo, useState } from "react";

import {
  TribeMemberList,
  type TribeMemberSelectionBadge,
} from "@/components/tribes/tribe-member-list";
import { Button } from "@/components/ui/button";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";
import styles from "./styles.module.scss";

const TRIBE_MEMBER_DIRECTORY_COPY = {
  allFilterLabel: "Todos",
  filterListLabel: "Filtrar miembros por elección",
  pendingFilterLabel: "Sin elegir",
} as const;

const FILTER_ID = {
  all: "all",
  pending: "pending",
} as const;

const FILTER_BUTTON = {
  activeVariant: "default",
  buttonType: "button",
  inactiveVariant: "outline",
  size: "sm",
} as const;

type TribeMemberFilterOption = {
  id: string;
  label: string;
};

type TribeMemberDirectoryProps = {
  filterOptions: TribeMemberFilterOption[];
  members: TribeMemberResult[];
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>;
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

export function TribeMemberDirectory({
  filterOptions,
  members,
  selectionsByMemberId,
}: TribeMemberDirectoryProps) {
  const [activeFilterId, setActiveFilterId] = useState<string>(FILTER_ID.all);
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
  const filteredMembers = useMemo(
    () => filterMembers(members, selectionsByMemberId, activeFilterId),
    [activeFilterId, members, selectionsByMemberId]
  );
  const showFilters = filterOptions.length > 0;

  return (
    <div className={styles.TribeMemberDirectory}>
      {showFilters ? (
        <ul
          aria-label={TRIBE_MEMBER_DIRECTORY_COPY.filterListLabel}
          className={styles.TribeMemberDirectory__filterList}
        >
          {availableFilters.map((filter) => {
            const isActive = filter.id === activeFilterId;
            const count = countMembersForFilter(
              members,
              selectionsByMemberId,
              filter.id
            );

            return (
              <li
                className={styles.TribeMemberDirectory__filterItem}
                key={filter.id}
              >
                <Button
                  className={styles.TribeMemberDirectory__filterButton}
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
    </div>
  );
}
