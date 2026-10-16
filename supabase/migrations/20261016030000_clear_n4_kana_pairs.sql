-- Clear the last kana/kanji pairs in the N4 pack: drop the kana card when its kanji card is in
-- another pack at the same or an easier level (よやく goes, 予約 stays). None of these is a word normally
-- written in kana. After this every starter-pack word has exactly one card. Safe to re-run.

-- JLPT N4 Kickstart Vol. 2: 347 → 337 (ていねい→丁寧 N4 Vol. 1, てんいん→店員 N5 Vol. 4, どうぐ→道具 N5 Vol. 4, とくに→特に N4 Vol. 1, やくそく→約束 N4 Vol. 1, ようじ→用事 N5 Vol. 4, よてい→予定 N4 Vol. 1, よやく→予約 N4 Vol. 1, このごろ→この頃 N4 Vol. 1, がんばる→頑張る N4 Vol. 1)
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('ていねい', 'てんいん', 'どうぐ', 'とくに', 'やくそく', 'ようじ', 'よてい', 'よやく', 'このごろ', 'がんばる')
) where id = '71b8eafe-1c6b-4c12-a57f-f13d6d00a08c';

-- Word count in the description (separate statement so it sees the new list)
update starter_packs
set description = regexp_replace(description, '\(\d+ words\)', '(' || jsonb_array_length(card_data) || ' words)')
where id in ('71b8eafe-1c6b-4c12-a57f-f13d6d00a08c');
