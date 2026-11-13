-- Lets the user rename a saved passage in "My passages" — otherwise it falls back to the
-- AI topic (generated) or a lead-in snippet of the text (pasted).
alter table reader_passages add column if not exists title text;
