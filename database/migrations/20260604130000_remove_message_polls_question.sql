-- Remove the redundant poll question. A poll now relies on the parent message
-- title and body for context, so the dedicated question field is dropped.
-- Dropping the column also removes its CHECK (char_length(trim(question)) ...) constraint.
ALTER TABLE public.message_polls DROP COLUMN question;
