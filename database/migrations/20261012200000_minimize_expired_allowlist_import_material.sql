-- Keep immutable row outcomes and imported entries while destroying temporary file/report data.
ALTER TABLE public.academy_allowlist_import_rows
  ADD COLUMN material_purged_at timestamptz,
  ADD CONSTRAINT admission_import_material_minimized_check
    CHECK(material_purged_at IS NULL OR (input_data='{}'::jsonb AND validation_result='{}'::jsonb));

CREATE INDEX admission_import_material_pending_idx
  ON public.academy_allowlist_import_rows(import_id,row_number)
  WHERE material_purged_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_allowlist_import_row_original()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original_deadline timestamptz;
BEGIN
  IF ROW(NEW.import_id,NEW.tribe_id,NEW.row_number)
    IS DISTINCT FROM ROW(OLD.import_id,OLD.tribe_id,OLD.row_number) THEN
    RAISE EXCEPTION 'allowlist import row identity is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.material_purged_at IS NOT NULL AND
    ROW(NEW.material_purged_at,NEW.input_data,NEW.validation_result)
    IS DISTINCT FROM ROW(OLD.material_purged_at,OLD.input_data,OLD.validation_result) THEN
    RAISE EXCEPTION 'allowlist import minimized material cannot be restored' USING ERRCODE='23514';
  END IF;
  IF NEW.material_purged_at IS DISTINCT FROM OLD.material_purged_at THEN
    SELECT preview.purge_after INTO original_deadline FROM public.academy_allowlist_imports preview
      WHERE preview.id=OLD.import_id AND preview.tribe_id=OLD.tribe_id FOR SHARE;
    IF OLD.material_purged_at IS NOT NULL OR NEW.material_purged_at IS NULL
      OR original_deadline IS NULL OR clock_timestamp()<original_deadline
      OR NEW.material_purged_at<original_deadline OR NEW.material_purged_at>clock_timestamp()
      OR NEW.input_data<>'{}'::jsonb OR NEW.validation_result<>'{}'::jsonb
      OR ROW(NEW.outcome,NEW.entry_id,NEW.entry_version,NEW.confirmed_operation_id,NEW.committed_at)
        IS DISTINCT FROM ROW(OLD.outcome,OLD.entry_id,OLD.entry_version,OLD.confirmed_operation_id,OLD.committed_at) THEN
      RAISE EXCEPTION 'allowlist import minimization is not an eligible original transition' USING ERRCODE='23514';
    END IF;
  ELSIF ROW(NEW.input_data,NEW.validation_result)
    IS DISTINCT FROM ROW(OLD.input_data,OLD.validation_result) THEN
    RAISE EXCEPTION 'allowlist import input and preview validation are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.outcome IS NOT NULL AND ROW(NEW.outcome,NEW.entry_id,NEW.entry_version,NEW.confirmed_operation_id,NEW.committed_at)
    IS DISTINCT FROM ROW(OLD.outcome,OLD.entry_id,OLD.entry_version,OLD.confirmed_operation_id,OLD.committed_at) THEN
    RAISE EXCEPTION 'allowlist import confirmed row is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.material_purged_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'allowlist import minimized row cannot accept new effects' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_row_original() FROM PUBLIC;

CREATE FUNCTION public.guard_allowlist_import_material_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original_deadline timestamptz;
BEGIN
  SELECT preview.purge_after INTO original_deadline FROM public.academy_allowlist_imports preview
    WHERE preview.id=NEW.import_id AND preview.tribe_id=NEW.tribe_id FOR SHARE;
  IF original_deadline IS NULL OR clock_timestamp()>=original_deadline OR NEW.material_purged_at IS NOT NULL THEN
    RAISE EXCEPTION 'allowlist import expired material cannot be inserted' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_material_insert() FROM PUBLIC;
CREATE TRIGGER admission_import_material_insert_guard BEFORE INSERT ON public.academy_allowlist_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.guard_allowlist_import_material_insert();

CREATE FUNCTION public.purge_expired_allowlist_import_material(requested_limit integer DEFAULT 500)
RETURNS TABLE(purged_rows integer,completed_imports integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original_import record; remaining integer; changed_rows integer;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>2000 THEN
    RAISE EXCEPTION 'allowlist import material row batch is invalid' USING ERRCODE='23514';
  END IF;
  purged_rows=0; completed_imports=0;
  FOR original_import IN
    SELECT preview.id,preview.tribe_id FROM public.tribes tribe
    JOIN public.academy_allowlist_imports preview ON preview.tribe_id=tribe.id
    WHERE preview.purge_after<=clock_timestamp()
      AND EXISTS(SELECT 1 FROM public.academy_allowlist_import_rows pending
        WHERE pending.import_id=preview.id AND pending.material_purged_at IS NULL)
    ORDER BY tribe.id,preview.purge_after,preview.id
    LIMIT requested_limit FOR UPDATE OF tribe,preview SKIP LOCKED
  LOOP
    remaining=requested_limit-purged_rows;
    EXIT WHEN remaining<=0;
    WITH selected_rows AS (
      SELECT row.row_number FROM public.academy_allowlist_import_rows row
      WHERE row.import_id=original_import.id AND row.tribe_id=original_import.tribe_id
        AND row.material_purged_at IS NULL
      ORDER BY row.row_number LIMIT remaining FOR UPDATE OF row SKIP LOCKED
    )
    UPDATE public.academy_allowlist_import_rows row
      SET input_data='{}'::jsonb,validation_result='{}'::jsonb,material_purged_at=clock_timestamp()
      FROM selected_rows selected WHERE row.import_id=original_import.id
        AND row.tribe_id=original_import.tribe_id AND row.row_number=selected.row_number;
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    purged_rows=purged_rows+changed_rows;
    UPDATE public.academy_allowlist_imports SET state='expired',version=version+1
      WHERE id=original_import.id AND tribe_id=original_import.tribe_id AND state IN ('preview','processing');
    IF changed_rows>0 AND NOT EXISTS(SELECT 1 FROM public.academy_allowlist_import_rows pending
      WHERE pending.import_id=original_import.id AND pending.material_purged_at IS NULL) THEN
      completed_imports=completed_imports+1;
    END IF;
  END LOOP;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_allowlist_import_material(integer) FROM PUBLIC;
