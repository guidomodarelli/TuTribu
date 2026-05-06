WITH ronda_channels AS (
  SELECT
    tribe_channels.tribe_id,
    tribe_channels.id
  FROM public.tribe_channels
  WHERE tribe_channels.slug = 'ronda'
),
moved_messages AS (
  UPDATE public.messages
  SET
    channel_id = ronda_channels.id,
    updated_at = timezone('utc', now())
  FROM public.tribe_channels source_channels
  INNER JOIN ronda_channels
    ON ronda_channels.tribe_id = source_channels.tribe_id
  WHERE messages.channel_id = source_channels.id
    AND source_channels.slug IN ('anuncios', 'preguntas', 'eventos')
  RETURNING messages.id
)
DELETE FROM public.tribe_channels obsolete_channels
USING ronda_channels
WHERE obsolete_channels.tribe_id = ronda_channels.tribe_id
  AND obsolete_channels.slug IN ('anuncios', 'preguntas', 'eventos');
