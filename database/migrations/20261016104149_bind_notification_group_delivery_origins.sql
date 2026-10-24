-- Group provenance survives live group/tribe retirement for exactly the retained delivery lifetime.
LOCK TABLE public.tribes,public.academy_admission_tribe_namespaces,
  public.admission_notification_groups,public.message_deliveries IN ACCESS EXCLUSIVE MODE NOWAIT;
--> statement-breakpoint

CREATE TABLE public.messaging_notification_group_origins (
  group_id uuid PRIMARY KEY,
  tribe_id uuid NOT NULL,
  recipient_ref text NOT NULL,
  audience text NOT NULL CHECK(audience IN ('applicant','reviewer')),
  CONSTRAINT messaging_notification_group_origin_scope_key UNIQUE(group_id,tribe_id,recipient_ref,audience),
  CONSTRAINT messaging_notification_group_origin_namespace_fkey FOREIGN KEY(tribe_id)
    REFERENCES public.academy_admission_tribe_namespaces(tribe_id)
);
ALTER TABLE public.messaging_notification_group_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_notification_group_origins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messaging_notification_group_origins FROM PUBLIC;
CREATE POLICY messaging_notification_group_origin_owner ON public.messaging_notification_group_origins FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_notification_group_origins'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_notification_group_origins'::regclass));

ALTER TABLE public.message_deliveries
  ADD COLUMN notification_group_id uuid,
  ADD COLUMN notification_group_audience text,
  ADD CONSTRAINT messaging_delivery_notification_group_scope_check CHECK(
    (notification_group_id IS NULL AND notification_group_audience IS NULL)
    OR (notification_group_id IS NOT NULL AND notification_group_audience IS NOT NULL
      AND notification_group_audience IN ('applicant','reviewer')
      AND purpose='admission_notification' AND channel='email' AND source_resource_id=notification_group_id)),
  ADD CONSTRAINT messaging_delivery_notification_group_origin_fkey
    FOREIGN KEY(notification_group_id,tribe_id,recipient_ref,notification_group_audience)
    REFERENCES public.messaging_notification_group_origins(group_id,tribe_id,recipient_ref,audience);

-- Explicit group provenance separates namespaces even if an obligation UUID equals a group UUID.
ALTER TABLE public.message_deliveries DROP CONSTRAINT messaging_delivery_logical_key;
ALTER TABLE public.message_deliveries ADD CONSTRAINT messaging_delivery_logical_key
  UNIQUE NULLS NOT DISTINCT(tribe_id,purpose,source_resource_id,recipient_ref,recovery_of_delivery_id,notification_group_id,notification_group_audience);
CREATE INDEX messaging_delivery_notification_group_origin_idx ON public.message_deliveries(notification_group_id)
  WHERE notification_group_id IS NOT NULL;

CREATE FUNCTION public.register_notification_group_delivery_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE live_group public.admission_notification_groups%ROWTYPE;
BEGIN
  IF NEW.notification_group_id IS NULL THEN
    IF NEW.notification_group_audience IS NOT NULL THEN
      RAISE EXCEPTION 'notification group provenance requires its group identity'
        USING ERRCODE='23514',CONSTRAINT='messaging_delivery_notification_group_scope_check';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.notification_group_audience IS NULL OR NEW.notification_group_audience NOT IN ('applicant','reviewer')
    OR NEW.purpose IS DISTINCT FROM 'admission_notification' OR NEW.channel IS DISTINCT FROM 'email'
    OR NEW.source_resource_id IS DISTINCT FROM NEW.notification_group_id THEN
    RAISE EXCEPTION 'notification group delivery scope is inconsistent'
      USING ERRCODE='23514',CONSTRAINT='messaging_delivery_notification_group_scope_check';
  END IF;
  -- Follow the producer's existing tribe fence; never wait backwards on retirement.
  PERFORM tribe.id FROM public.tribes tribe
    JOIN public.academy_admission_tribe_namespaces namespace ON namespace.tribe_id=tribe.id
    WHERE tribe.id=NEW.tribe_id AND namespace.retired_at IS NULL FOR KEY SHARE OF tribe NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'notification group delivery requires its live tribe' USING ERRCODE='42501'; END IF;
  SELECT * INTO live_group FROM public.admission_notification_groups WHERE id=NEW.notification_group_id FOR SHARE;
  IF NOT FOUND OR ROW(live_group.tribe_id,live_group.recipient_user_id,live_group.audience)
    IS DISTINCT FROM ROW(NEW.tribe_id,NEW.recipient_ref,NEW.notification_group_audience) THEN
    RAISE EXCEPTION 'notification group delivery requires its exact scoped source'
      USING ERRCODE='23503',CONSTRAINT='messaging_delivery_notification_group_origin_fkey';
  END IF;
  IF live_group.state<>'frozen' OR live_group.frozen_manifest IS NULL OR live_group.deadline_at IS NULL
    OR NEW.deadline_at IS DISTINCT FROM live_group.deadline_at THEN
    RAISE EXCEPTION 'notification group delivery requires its original frozen deadline' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.messaging_notification_group_origins(group_id,tribe_id,recipient_ref,audience)
    VALUES(live_group.id,live_group.tribe_id,live_group.recipient_user_id,live_group.audience)
    ON CONFLICT(group_id) DO NOTHING;
  IF clock_timestamp()>=live_group.deadline_at THEN
    RAISE EXCEPTION 'notification group delivery deadline elapsed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.register_notification_group_delivery_origin() FROM PUBLIC;
CREATE TRIGGER notification_group_delivery_origin_registration BEFORE INSERT ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.register_notification_group_delivery_origin();

CREATE FUNCTION public.guard_notification_group_delivery_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF ROW(NEW.notification_group_id,NEW.notification_group_audience)
    IS DISTINCT FROM ROW(OLD.notification_group_id,OLD.notification_group_audience) THEN
    RAISE EXCEPTION 'notification group delivery provenance is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_group_delivery_identity() FROM PUBLIC;
CREATE TRIGGER notification_group_delivery_identity_guard BEFORE UPDATE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_group_delivery_identity();

CREATE FUNCTION public.guard_notification_group_origin_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'notification group origin is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_group_origin_identity() FROM PUBLIC;
CREATE TRIGGER notification_group_origin_identity_guard BEFORE UPDATE ON public.messaging_notification_group_origins
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_group_origin_identity();

-- Keep the original recovery audit/transport guard and additionally preserve explicit group identity.
CREATE FUNCTION public.guard_notification_group_delivery_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original public.message_deliveries%ROWTYPE;
BEGIN
  IF NEW.recovery_of_delivery_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM public.message_deliveries WHERE id=NEW.recovery_of_delivery_id;
  IF NOT FOUND OR ROW(NEW.notification_group_id,NEW.notification_group_audience)
    IS DISTINCT FROM ROW(original.notification_group_id,original.notification_group_audience) THEN
    RAISE EXCEPTION 'notification recovery must preserve its original group provenance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_group_delivery_lineage() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER notification_group_delivery_lineage_guard AFTER INSERT ON public.message_deliveries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_notification_group_delivery_lineage();

CREATE FUNCTION public.release_deleted_notification_group_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD.notification_group_id IS NOT NULL THEN
    -- Serialize last-reference cleanup so concurrent child deletions cannot strand an origin.
    PERFORM group_id FROM public.messaging_notification_group_origins
      WHERE group_id=OLD.notification_group_id FOR UPDATE;
    DELETE FROM public.messaging_notification_group_origins origin
      WHERE origin.group_id=OLD.notification_group_id
        AND NOT EXISTS(SELECT 1 FROM public.message_deliveries delivery WHERE delivery.notification_group_id=origin.group_id);
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_deleted_notification_group_origin() FROM PUBLIC;
CREATE TRIGGER notification_group_origin_release AFTER DELETE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.release_deleted_notification_group_origin();
