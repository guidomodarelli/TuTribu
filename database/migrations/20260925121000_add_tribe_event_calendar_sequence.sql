-- Tribe events phase 4: persisted iCalendar revision counter per series.
--
-- The calendar feed publishes each series with a stable UID and a SEQUENCE
-- that calendar apps use to pick the newest revision (RFC 5545 §3.8.7.4).
-- Deriving SEQUENCE from events.updated_at (minutes, or even seconds, since
-- the epoch) gives two edits inside the same bucket the same number, so a
-- client may keep the older title, schedule, cancellation, or move forever.
-- Milliseconds do not fit the 32-bit INTEGER of iCalendar.
--
-- calendar_sequence is a counter that the database raises by exactly one on
-- every UPDATE of the row, so it strictly increases for every persisted
-- change of the series. That covers the edit of the series and the
-- touched_event CTE that bumps the series when a date exception is saved or
-- restored. An UPDATE that changes nothing relevant still raises it, which
-- only makes clients refresh an unchanged component (harmless). A 32-bit
-- counter would need billions of edits of one series to overflow.
--
-- The counter is owned by the trigger: a value sent by the app on INSERT or
-- UPDATE is ignored, so no writer can lower it or skip the increment.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS calendar_sequence integer NOT NULL DEFAULT 0;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_calendar_sequence_not_negative;
ALTER TABLE public.events
ADD CONSTRAINT events_calendar_sequence_not_negative CHECK (calendar_sequence >= 0);

-- Invoker trigger function: it only rewrites NEW, so it needs no privilege
-- beyond the UPDATE/INSERT the caller already holds.
CREATE OR REPLACE FUNCTION public.assign_event_calendar_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.calendar_sequence := 0;
  ELSE
    NEW.calendar_sequence := OLD.calendar_sequence + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_assign_calendar_sequence ON public.events;
CREATE TRIGGER events_assign_calendar_sequence
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.assign_event_calendar_sequence();
