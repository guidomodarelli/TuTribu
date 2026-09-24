-- Tribe events phase 4: tell in SQL whether a series has an occurrence in a
-- window.
--
-- The calendar feed applies its budgets inside one SQL statement, before any
-- occurrence expansion. Its candidate filter only compared the series start
-- and recurrence_until with the window, so a series whose cadence has no
-- date in it (for example a monthly series anchored on the 31st that ends on
-- February 15, read for a window starting February 1) was still a candidate,
-- was emitted, and consumed the component budget of real in-window series.
--
-- tribe_event_series_has_occurrence_in_range answers whether at least one
-- slot of the series overlaps [range_start, range_end): it starts before
-- range_end and its effective end (the slot plus the series duration, or the
-- default 60 minutes without ends_at, the same rule as
-- tribe_event_occurrence_ends_at and the domain
-- getTribeEventOccurrenceEndTime) is after range_start. Each candidate slot
-- is confirmed with is_tribe_event_series_occurrence, the SQL mirror of the
-- domain expansion (Buenos Aires wall clock at the fixed -3 offset, weekly
-- and biweekly every 7/14 days, monthly on the anchor day with months that
-- lack it skipped, recurrence_until inclusive), so both rules stay in one
-- place.
--
-- Cost stays constant, never proportional to the age of the series or to
-- its duration (validation only asks endsAt to be after startsAt, so a
-- mistaken distant end date is accepted):
--   * none: the single start.
--   * weekly/biweekly: only the first two slots at or after the earliest
--     start that can still overlap (range_start minus the duration). The
--     first one either overlaps, ends exactly at range_start (then the second
--     one is the next candidate), or already starts at or after range_end;
--     any later slot is also later than recurrence_until if the first is.
--   * monthly: only the three local months that end at the last month that
--     can hold a slot (the month of range_end, or of recurrence_until when it
--     is earlier). Every slot lasts the same duration, so a series overlaps
--     the window exactly when its latest slot before range_end (and within
--     recurrence_until) ends after range_start. That slot is in the last
--     month or, when that month's slot is too late or the month lacks the
--     anchor day, in one of the two previous ones: no two consecutive months
--     lack a day from 1 to 31. Adding months to the local anchor clamps to
--     the month end (January 31 + 1 month = February 28), and
--     is_tribe_event_series_occurrence rejects that clamped day.
-- The earliest overlapping start is computed in epoch seconds: range_start
-- minus a duration of millennia (an end date in year 9999) falls before the
-- timestamptz range and a timestamp subtraction would fail the whole feed.
-- Weekly steps are added as seconds so no session time zone or DST rule can
-- shift them.
--
-- Pure and IMMUTABLE, not SECURITY DEFINER, and it reads no table. It does
-- not call tribe_event_occurrence_ends_at (owner-only) so the request role
-- only needs EXECUTE on this function and on is_tribe_event_series_occurrence
-- (granted by 20260925122000). PUBLIC stays revoked; the request role grant
-- is guarded because the role may not exist in every environment.

CREATE OR REPLACE FUNCTION public.tribe_event_series_has_occurrence_in_range(
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  event_recurrence_frequency text,
  event_recurrence_until timestamptz,
  range_start timestamptz,
  range_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH schedule AS (
    SELECT
      greatest(
        coalesce(event_ends_at - event_starts_at, interval '60 minutes'),
        interval '0'
      ) AS occurrence_duration,
      CASE event_recurrence_frequency
        WHEN 'weekly' THEN 604800
        WHEN 'biweekly' THEN 1209600
      END AS weekly_period_seconds,
      -- Months walked back from the last month that can hold a slot: the
      -- latest slot before range_end is in that month or, when that month's
      -- slot is too late or the month lacks the anchor day, in one of the two
      -- previous months (no two consecutive months lack a day from 1 to 31).
      2 AS monthly_lookback_months,
      (event_starts_at AT TIME ZONE 'UTC') + interval '-3 hours' AS series_local
  ),
  window_bounds AS (
    SELECT
      schedule.*,
      -- Epoch arithmetic: range_start minus a very long duration can fall
      -- before the timestamptz range, and a timestamp subtraction would fail.
      extract(epoch FROM range_start) - extract(epoch FROM schedule.occurrence_duration)
        AS earliest_start_epoch,
      (least(range_end, coalesce(event_recurrence_until, range_end)) AT TIME ZONE 'UTC')
        + interval '-3 hours' AS last_slot_bound_local
    FROM schedule
  ),
  candidate_slots AS (
    SELECT event_starts_at AS slot_starts_at
    WHERE event_recurrence_frequency = 'none'

    UNION ALL

    SELECT event_starts_at
      + make_interval(secs => (first_slot.slot_index + slot_step) * window_bounds.weekly_period_seconds)
    FROM window_bounds
    CROSS JOIN LATERAL (
      SELECT greatest(
        0,
        ceil(
          (window_bounds.earliest_start_epoch - extract(epoch FROM event_starts_at))
            / window_bounds.weekly_period_seconds
        )
      )::bigint AS slot_index
    ) AS first_slot
    CROSS JOIN generate_series(0, 1) AS slot_step
    WHERE window_bounds.weekly_period_seconds IS NOT NULL

    UNION ALL

    SELECT ((window_bounds.series_local + make_interval(months => month_offset::integer))
        + interval '3 hours') AT TIME ZONE 'UTC'
    FROM window_bounds
    CROSS JOIN LATERAL (
      SELECT (
        (extract(year FROM window_bounds.last_slot_bound_local) - extract(year FROM window_bounds.series_local)) * 12
          + extract(month FROM window_bounds.last_slot_bound_local) - extract(month FROM window_bounds.series_local)
      )::bigint AS last_month_offset
    ) AS last_month
    CROSS JOIN LATERAL generate_series(
      greatest(0, last_month.last_month_offset - window_bounds.monthly_lookback_months),
      last_month.last_month_offset
    ) AS month_offset
    WHERE event_recurrence_frequency = 'monthly'
  )
  SELECT EXISTS (
    SELECT 1
    FROM candidate_slots
    CROSS JOIN schedule
    WHERE candidate_slots.slot_starts_at < range_end
      AND candidate_slots.slot_starts_at + schedule.occurrence_duration > range_start
      AND public.is_tribe_event_series_occurrence(
        candidate_slots.slot_starts_at,
        event_starts_at,
        event_recurrence_frequency,
        event_recurrence_until
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.tribe_event_series_has_occurrence_in_range(
  timestamptz, timestamptz, text, timestamptz, timestamptz, timestamptz
)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.tribe_event_series_has_occurrence_in_range(
      timestamptz, timestamptz, text, timestamptz, timestamptz, timestamptz
    ) TO authenticated;
  END IF;
END $$;
