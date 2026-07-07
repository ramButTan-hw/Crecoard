-- File bank files — persisted per filebank item (BlockItem with type="filebank")
-- Files are NOT stored in the board JSONB blob; this table is the source of truth.

CREATE TABLE IF NOT EXISTS public.file_bank_files (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      TEXT         NOT NULL,   -- nanoid() of the BlockItem
  board_id     TEXT         NOT NULL,
  name         TEXT         NOT NULL,
  size_bytes   BIGINT       NOT NULL DEFAULT 0,
  mime_type    TEXT         NOT NULL DEFAULT '',
  uploaded_by  TEXT         NOT NULL DEFAULT '',
  uploaded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  url          TEXT
);

CREATE INDEX IF NOT EXISTS file_bank_files_item
  ON public.file_bank_files (item_id, uploaded_at);

ALTER TABLE public.file_bank_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_bank_read" ON public.file_bank_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "file_bank_insert" ON public.file_bank_files
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.file_bank_files;
