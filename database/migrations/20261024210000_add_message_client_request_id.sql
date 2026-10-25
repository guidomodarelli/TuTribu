-- Lets the campfire composer retry a publication whose response was lost without creating a duplicate:
-- the client sends one UUID per submitted draft and the same author cannot store it twice.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS messages_author_client_request_id_key
  ON public.messages (author_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.messages.client_request_id IS
  'Idempotency key chosen by the author''s client for one publication; NULL for messages created without one.';
