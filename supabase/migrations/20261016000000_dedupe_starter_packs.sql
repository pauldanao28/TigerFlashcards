-- Remove each starter pack's own duplicate cards: kana copies of a kanji card in the same pack
-- at the same or an easier level (だめ next to 駄目), and word + particle copies (私は next to 私).
-- Rules: src/lib/duplicates.ts. Only affects future imports; existing decks are unchanged.

-- JLPT N5 Kickstart Vol. 4: 316 → 313
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('私は', '何を', 'いつ')
) where id = '7b5da3be-8987-4b95-9c51-ff3fd858bb94';

-- JLPT N5 Kickstart Vol. 5: 315 → 310
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('けさ', 'みっか', 'みなさん', 'ください', 'はたち')
) where id = 'a7dffbee-871d-47d5-aa6f-d7cffb4ff624';

-- JLPT N4 Kickstart Vol. 2: 363 → 350
update starter_packs set card_data = (
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from jsonb_array_elements(card_data) with ordinality as e(c, i)
  where c->>'japanese' not in ('だめ', 'つかまえる', 'つたえる', 'てら', 'でんとう', 'とおく', 'とくべつ', 'とどける', 'ひどい', 'やわらかい', 'よごれる', 'ほとんど', 'まず')
) where id = '71b8eafe-1c6b-4c12-a57f-f13d6d00a08c';

