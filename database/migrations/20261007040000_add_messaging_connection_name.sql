-- Retains an internal display label without changing existing ownership, slots or credential versions.
ALTER TABLE public.tenant_messaging_connections
  ADD COLUMN name text NOT NULL DEFAULT 'Conexión de mensajería',
  ADD CONSTRAINT messaging_connection_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 100);
