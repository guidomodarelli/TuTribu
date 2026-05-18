import type { ColumnType, Generated } from "kysely";

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

type TribeCreatorWhitelistTable = {
  created_at: TimestampColumn;
  created_by: string | null;
  email: string;
  id: Generated<string>;
  notes: string | null;
};

type TribesTable = {
  created_by: string;
  created_at: TimestampColumn;
  id: Generated<string>;
  name: string;
  slug: string;
  visibility: string;
};

type TribeMembersTable = {
  created_at: TimestampColumn;
  id: Generated<string>;
  role: string;
  status: string;
  status_reason: string;
  tribe_id: string;
  user_id: string;
};

export type KyselyRequestDatabaseSchema = {
  tribe_creator_whitelist: TribeCreatorWhitelistTable;
  tribe_members: TribeMembersTable;
  tribes: TribesTable;
};
