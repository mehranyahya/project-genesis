-- Mirrors the already-applied Supabase migration with version 20260807132437.
-- Keep this file in Git so repository migration history matches the database.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
