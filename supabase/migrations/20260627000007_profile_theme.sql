-- Add theme persistence columns to profiles so theme follows the account, not the browser.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_vars JSONB,
  ADD COLUMN IF NOT EXISTS app_font   TEXT DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS app_bg     JSONB;
