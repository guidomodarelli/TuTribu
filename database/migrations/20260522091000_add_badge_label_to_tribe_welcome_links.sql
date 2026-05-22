ALTER TABLE public.tribe_welcome_links
  ADD COLUMN badge_label text;

UPDATE public.tribe_welcome_links
SET badge_label = substring(label from 1 for 30);

ALTER TABLE public.tribe_welcome_links
  ALTER COLUMN badge_label SET NOT NULL,
  ADD CONSTRAINT tribe_welcome_links_badge_label_not_blank_check
    CHECK (btrim(badge_label) <> ''),
  ADD CONSTRAINT tribe_welcome_links_badge_label_max_length_check
    CHECK (length(badge_label) <= 30);
