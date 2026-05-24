ALTER TABLE public.tribe_welcome_settings
  ADD COLUMN IF NOT EXISTS selection_modal_title text NOT NULL
    DEFAULT 'Elegí una opción para empezar',
  ADD COLUMN IF NOT EXISTS selection_modal_description text NOT NULL
    DEFAULT 'Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.',
  ADD COLUMN IF NOT EXISTS selection_modal_benefit text,
  ADD COLUMN IF NOT EXISTS links_heading text NOT NULL
    DEFAULT 'Recursos para empezar';

ALTER TABLE public.tribe_welcome_settings
  ADD CONSTRAINT tribe_welcome_settings_selection_modal_title_not_blank_check
    CHECK (btrim(selection_modal_title) <> ''),
  ADD CONSTRAINT tribe_welcome_settings_selection_modal_description_not_blank_check
    CHECK (btrim(selection_modal_description) <> ''),
  ADD CONSTRAINT tribe_welcome_settings_links_heading_not_blank_check
    CHECK (btrim(links_heading) <> '');
