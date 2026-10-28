-- SPARK: Reasoning Log entry types.
--
-- The Reasoning Log reuses the append-only item_entries table. This only widens
-- the allowed kinds: 'note' (already allowed) plus four reasoning types.
-- Additive: existing rows still satisfy the constraint; nothing else changes.
--
-- Future-proofing (not built yet, nothing here blocks it):
--   correction  -> a new entry with data.corrects = <entry id>
--   retraction  -> a new entry, or a nullable retracted_at column
--   deletion    -> an owner-only DELETE policy scoped to reasoning kinds
-- Row-level security is unchanged: owners can read and add entries, never
-- update or delete them, and cannot write to anyone else's items.

alter table public.item_entries drop constraint item_entries_kind_check;
alter table public.item_entries add constraint item_entries_kind_check
  check (kind in (
    'note', 'hypothesis', 'challenge', 'decision', 'lesson',   -- Reasoning Log (written by the user)
    'ai_challenge',                                            -- reserved for future AI guidance
    'status_change', 'link_removed'                            -- automatic History
  ));
