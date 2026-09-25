-- Tribe events phase 3: event type from a fixed catalog.
--
-- The catalog lives in src/modules/events/constants/tribe-events.ts
-- (TRIBE_EVENT_TYPE); the CHECK mirrors it so a value the UI cannot render is
-- never stored. Existing series default to "live", the most common kind of
-- digital meeting.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'live';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_valid_event_type;

ALTER TABLE public.events
  ADD CONSTRAINT events_valid_event_type CHECK (
    event_type IN ('live', 'workshop', 'qa', 'in_person', 'social')
  );
