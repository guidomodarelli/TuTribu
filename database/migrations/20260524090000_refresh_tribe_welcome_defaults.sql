ALTER TABLE public.tribe_welcome_settings
  ALTER COLUMN welcome_message SET DEFAULT
    'Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.',
  ALTER COLUMN selection_modal_title SET DEFAULT
    'Elegí cómo querés empezar',
  ALTER COLUMN selection_modal_description SET DEFAULT
    'Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.';
