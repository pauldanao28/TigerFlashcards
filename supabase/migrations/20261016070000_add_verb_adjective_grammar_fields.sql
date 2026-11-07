-- Verb/adjective grammar metadata, filled in lazily (not backfilled) the first time an
-- eligible card gets drawn in Study — see /api/jisho's classify mode and StudyView's
-- fill-in effect. Shared across every user once set, same pattern as kanji mnemonics.
alter table master_cards add column if not exists te_form text;
alter table master_cards add column if not exists transitivity text check (transitivity in ('transitive', 'intransitive'));
alter table master_cards add column if not exists verb_type text check (verb_type in ('godan', 'ichidan', 'irregular'));
alter table master_cards add column if not exists adjective_type text check (adjective_type in ('i', 'na'));
