-- Merge same-level kana/kanji pairs across the N5 packs: drop the kana card when its kanji card
-- (same meaning, N5) is in another N5 pack — みず in Vol. 5 next to 水 in Kickstart. Only the kanji
-- card stays. 51 cards. Unique N5 words across the packs stay 896 (target 800): import already
-- skipped these. N4 pairs are left as they are. Rules: src/lib/duplicates.ts.

-- JLPT N5 Kickstart Vol. 2: 50 → 49 (ある→有る)
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('ある')
) where id = '4846bdbf-d735-4590-8a5e-fda4777e4956';

-- JLPT N5 Kickstart Vol. 4: 332 → 329 (海に→海, ごはん→ご飯, あなた→貴方)
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('海に', 'ごはん', 'あなた')
) where id = '7b5da3be-8987-4b95-9c51-ff3fd858bb94';

-- JLPT N5 Kickstart Vol. 5: 405 → 358 (あさって→明後日, きれい→綺麗, めがね→眼鏡, ぎゅうにゅう→牛乳, きょう→今日, きょうしつ→教室, きょねん→去年, ぎんこう→銀行, きんようび→金曜日, くすり→薬, くち→口, くつ→靴, くつした→靴下, くに→国, くるま→車, げつようび→月曜日, こうえん→公園, ごご→午後, ごぜん→午前, さん→三, たくさん→沢山, へた→下手, へや→部屋, ぼうし→帽子, ほん→本, ほんだな→本棚, まいしゅう→毎週, まいにち→毎日, まえ→前, まがる→曲がる, まち→町, まつ→待つ, まど→窓, まん→万, みぎ→右, みず→水, みせ→店, みち→道, よる→夜, らいげつ→来月, らいしゅう→来週, らいねん→来年, りょうり→料理, ろく→六, わかい→若い, わたし→私, わるい→悪い)
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('あさって', 'きれい', 'めがね', 'ぎゅうにゅう', 'きょう', 'きょうしつ', 'きょねん', 'ぎんこう', 'きんようび', 'くすり', 'くち', 'くつ', 'くつした', 'くに', 'くるま', 'げつようび', 'こうえん', 'ごご', 'ごぜん', 'さん', 'たくさん', 'へた', 'へや', 'ぼうし', 'ほん', 'ほんだな', 'まいしゅう', 'まいにち', 'まえ', 'まがる', 'まち', 'まつ', 'まど', 'まん', 'みぎ', 'みず', 'みせ', 'みち', 'よる', 'らいげつ', 'らいしゅう', 'らいねん', 'りょうり', 'ろく', 'わかい', 'わたし', 'わるい')
) where id = 'a7dffbee-871d-47d5-aa6f-d7cffb4ff624';

-- Word counts in the descriptions — "(405 words)" and a leading "50 essential …"
update starter_packs
set description = regexp_replace(regexp_replace(description, '\(\d+ words\)', '(' || jsonb_array_length(card_data) || ' words)'), '^\d+ ', jsonb_array_length(card_data) || ' ')
where id in ('4846bdbf-d735-4590-8a5e-fda4777e4956', '7b5da3be-8987-4b95-9c51-ff3fd858bb94', 'a7dffbee-871d-47d5-aa6f-d7cffb4ff624');
