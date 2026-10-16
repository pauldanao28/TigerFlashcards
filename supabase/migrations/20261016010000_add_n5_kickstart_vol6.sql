-- New starter pack: JLPT N5 Kickstart Vol. 6 — 114 N5 words that no other pack has.
-- 7 were added by hand to a deck before (降る, 思う, 旅行, 日本人, 単語, 本当, 週); the rest are
-- from Jisho's #jlpt-n5 list, missing from every pack (持つ, 住む, 結婚, 動物, 果物 …).
-- Brings the N5 packs to 896 distinct words (target 800, src/lib/scoring.ts).
-- Example sentences: run the backfill-examples admin endpoint after importing.
insert into starter_packs (name, description, card_data)
select 'JLPT N5 Kickstart Vol. 6',
       'Everyday nouns, verbs, and expressions the other N5 packs leave out. (114 words)',
       '[
 {
  "japanese": "降る",
  "reading": "ふる",
  "english": "fall / descend",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "思う",
  "reading": "おもう",
  "english": "think / feel",
  "jlpt_level": "N5",
  "partOfSpeech": "verb",
  "exampleSentence": {
   "en": "I think so.",
   "jp": "そのように思います。"
  }
 },
 {
  "japanese": "旅行",
  "reading": "りょこう",
  "english": "travel / trip",
  "jlpt_level": "N5",
  "partOfSpeech": "noun",
  "exampleSentence": {
   "en": "I plan to go on a trip in the summer.",
   "jp": "夏に旅行に行く予定です。"
  }
 },
 {
  "japanese": "日本人",
  "reading": "にほんじん",
  "english": "japanese person",
  "jlpt_level": "N5",
  "partOfSpeech": "noun",
  "exampleSentence": {
   "en": "He is a Japanese person.",
   "jp": "彼は日本人です。"
  }
 },
 {
  "japanese": "単語",
  "reading": "たんご",
  "english": "word / vocabulary",
  "jlpt_level": "N5",
  "partOfSpeech": "noun",
  "exampleSentence": {
   "en": "I will memorize new words.",
   "jp": "新しい単語を覚えます。"
  }
 },
 {
  "japanese": "本当",
  "reading": "ほんとう",
  "english": "truth / reality",
  "jlpt_level": "N5",
  "partOfSpeech": "noun",
  "exampleSentence": {
   "en": "Is that a true story?",
   "jp": "それは本当の話ですか。"
  }
 },
 {
  "japanese": "週",
  "reading": "しゅう",
  "english": "week",
  "jlpt_level": "N5",
  "partOfSpeech": "noun",
  "exampleSentence": {
   "en": "I exercise once a week.",
   "jp": "週に一度、運動します。"
  }
 },
 {
  "japanese": "タバコ",
  "reading": "タバコ",
  "english": "tobacco / cigarette / cigar",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "年",
  "reading": "とし",
  "english": "year",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "強い",
  "reading": "つよい",
  "english": "strong / potent / competent",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "昨夜",
  "reading": "ゆうべ",
  "english": "last night / yesterday evening",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "上る",
  "reading": "のぼる",
  "english": "to ascend / to go up / to climb",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "庭",
  "reading": "にわ",
  "english": "garden / yard / courtyard",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "警官",
  "reading": "けいかん",
  "english": "police officer / policeman / constable",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "止まる",
  "reading": "とまる",
  "english": "to stop (moving) / to come to a stop",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "隣",
  "reading": "となり",
  "english": "next (to) / adjoining / adjacent",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "番号",
  "reading": "ばんごう",
  "english": "number / series of digits",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "弱い",
  "reading": "よわい",
  "english": "weak / frail / delicate",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "果物",
  "reading": "くだもの",
  "english": "fruit",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "洋服",
  "reading": "ようふく",
  "english": "western-style clothes (cf. traditional japanese clothes)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "横",
  "reading": "よこ",
  "english": "horizontal (as opposed to vertical)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "丈夫",
  "reading": "じょうぶ",
  "english": "healthy / robust / strong",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "細い",
  "reading": "ほそい",
  "english": "thin / slender / fine",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "太い",
  "reading": "ふとい",
  "english": "fat / thick",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "留学生",
  "reading": "りゅうがくせい",
  "english": "overseas student / exchange student",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "一昨年",
  "reading": "おととし",
  "english": "year before last",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "結婚",
  "reading": "けっこん",
  "english": "marriage",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "住む",
  "reading": "すむ",
  "english": "to live (of humans) / to reside / to inhabit",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "死ぬ",
  "reading": "しぬ",
  "english": "to die / to pass away",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "どなた",
  "reading": "どなた",
  "english": "who",
  "jlpt_level": "N5",
  "partOfSpeech": "pronoun"
 },
 {
  "japanese": "なぜ",
  "reading": "なぜ",
  "english": "why / how / for what reason",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "しかし",
  "reading": "しかし",
  "english": "however / but",
  "jlpt_level": "N5",
  "partOfSpeech": "conjunction"
 },
 {
  "japanese": "渡る",
  "reading": "わたる",
  "english": "to cross over / to go across",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "晴れる",
  "reading": "はれる",
  "english": "to clear up / to clear away / to be sunny",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "奥さん",
  "reading": "おくさん",
  "english": "wife / your wife / his wife",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "だんだん",
  "reading": "だんだん",
  "english": "gradually / by degrees / little by little",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "並ぶ",
  "reading": "ならぶ",
  "english": "to line up / to stand in a line",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "うるさい",
  "reading": "うるさい",
  "english": "noisy / loud",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "つまらない",
  "reading": "つまらない",
  "english": "dull / uninteresting / boring",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "夕飯",
  "reading": "ゆうはん",
  "english": "evening meal / dinner / supper",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "はがき",
  "reading": "はがき",
  "english": "postcard",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ワイシャツ",
  "reading": "ワイシャツ",
  "english": "(formal) shirt / dress shirt / business shirt",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "おまわりさん",
  "reading": "おまわりさん",
  "english": "police officer",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "二十日",
  "reading": "はつか",
  "english": "20th day of the month",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "キロメートル",
  "reading": "キロメートル",
  "english": "kilometer / kilometre",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "再来年",
  "reading": "さらいねん",
  "english": "year after next",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "マッチ",
  "reading": "マッチ",
  "english": "match (for lighting a fire)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "背",
  "reading": "せ",
  "english": "back",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "プール",
  "reading": "プール",
  "english": "(swimming) pool",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ニュース",
  "reading": "ニュース",
  "english": "news",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "カメラ",
  "reading": "カメラ",
  "english": "camera",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ラジオ",
  "reading": "ラジオ",
  "english": "radio",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "レストラン",
  "reading": "レストラン",
  "english": "restaurant (esp. western-style)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ナイフ",
  "reading": "ナイフ",
  "english": "knife",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ネクタイ",
  "reading": "ネクタイ",
  "english": "tie / necktie",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ギター",
  "reading": "ギター",
  "english": "guitar",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "メートル",
  "reading": "メートル",
  "english": "metre (unit of length) / meter",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "セーター",
  "reading": "セーター",
  "english": "sweater / jumper",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "バター",
  "reading": "バター",
  "english": "butter",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "レコード",
  "reading": "レコード",
  "english": "(phonograph) record",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ポスト",
  "reading": "ポスト",
  "english": "postbox / mailbox / mail box",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "コピー",
  "reading": "コピー",
  "english": "copy / photocopy",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "シャワー",
  "reading": "シャワー",
  "english": "shower",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ハンカチ",
  "reading": "ハンカチ",
  "english": "handkerchief",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "テープ",
  "reading": "テープ",
  "english": "tape",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ストーブ",
  "reading": "ストーブ",
  "english": "(room) heater / stove",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "カップ",
  "reading": "カップ",
  "english": "cup (drinking vessel, measure, brassiere, prize, etc.)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "スリッパ",
  "reading": "スリッパ",
  "english": "slipper / slippers",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ペット",
  "reading": "ペット",
  "english": "pet",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "テープレコーダー",
  "reading": "テープレコーダー",
  "english": "tape recorder",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "動物",
  "reading": "どうぶつ",
  "english": "animal",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "九日",
  "reading": "ここのか",
  "english": "9th day of the month",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "門",
  "reading": "もん",
  "english": "gate",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "もっと",
  "reading": "もっと",
  "english": "(some) more / even more / longer",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "パーティー",
  "reading": "パーティー",
  "english": "party (social gathering)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "誰か",
  "reading": "だれか",
  "english": "someone / somebody",
  "jlpt_level": "N5",
  "partOfSpeech": "pronoun"
 },
 {
  "japanese": "どうぞ",
  "reading": "どうぞ",
  "english": "please / kindly / pray",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "こんな",
  "reading": "こんな",
  "english": "this sort of / this kind of / like this",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "ゆっくり",
  "reading": "ゆっくり",
  "english": "slowly / unhurriedly / without haste",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
 },
 {
  "japanese": "さあ",
  "reading": "さあ",
  "english": "come (on) / come now / come along",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "どうも",
  "reading": "どうも",
  "english": "thank you / thanks",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "じゃあ",
  "reading": "じゃあ",
  "english": "then / well / so",
  "jlpt_level": "N5",
  "partOfSpeech": "conjunction"
 },
 {
  "japanese": "それでは",
  "reading": "それでは",
  "english": "well, ... / right, ... / now, ...",
  "jlpt_level": "N5",
  "partOfSpeech": "conjunction"
 },
 {
  "japanese": "では",
  "reading": "では",
  "english": "then / well / so",
  "jlpt_level": "N5",
  "partOfSpeech": "conjunction"
 },
 {
  "japanese": "フィルム",
  "reading": "フィルム",
  "english": "film",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ぬるい",
  "reading": "ぬるい",
  "english": "lukewarm / tepid",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "カレンダー",
  "reading": "カレンダー",
  "english": "calendar",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "そうして",
  "reading": "そうして",
  "english": "and / like that",
  "jlpt_level": "N5",
  "partOfSpeech": "conjunction"
 },
 {
  "japanese": "グラム",
  "reading": "グラム",
  "english": "gram / gramme",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "キログラム",
  "reading": "キログラム",
  "english": "kilogram / kilogramme",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "字引",
  "reading": "じびき",
  "english": "dictionary",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "コート",
  "reading": "コート",
  "english": "coat",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "フォーク",
  "reading": "フォーク",
  "english": "fork",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "ラジカセ",
  "reading": "ラジカセ",
  "english": "radio-cassette player",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "村",
  "reading": "むら",
  "english": "village",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "自動車",
  "reading": "じどうしゃ",
  "english": "car / automobile / motorcar",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "雑誌",
  "reading": "ざっし",
  "english": "magazine / journal / periodical",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "塩",
  "reading": "しお",
  "english": "salt / common salt / table salt",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "夏休み",
  "reading": "なつやすみ",
  "english": "summer vacation / summer holiday",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "切手",
  "reading": "きって",
  "english": "stamp (postage)",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "作文",
  "reading": "さくぶん",
  "english": "writing (an essay, prose, etc.) / composition",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "紅茶",
  "reading": "こうちゃ",
  "english": "black tea",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "風呂",
  "reading": "ふろ",
  "english": "bath / bathing / bathtub",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "封筒",
  "reading": "ふうとう",
  "english": "envelope",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "牛肉",
  "reading": "ぎゅうにく",
  "english": "beef",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "交差点",
  "reading": "こうさてん",
  "english": "crossing / intersection",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "茶碗",
  "reading": "ちゃわん",
  "english": "rice bowl / tea cup / teacup",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "万年筆",
  "reading": "まんねんひつ",
  "english": "fountain pen",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "灰皿",
  "reading": "はいざら",
  "english": "ashtray",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "豚肉",
  "reading": "ぶたにく",
  "english": "pork",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "交番",
  "reading": "こうばん",
  "english": "police box / koban / small neighborhood police station",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "花瓶",
  "reading": "かびん",
  "english": "(flower) vase",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "八百屋",
  "reading": "やおや",
  "english": "greengrocer / fruit and vegetable shop",
  "jlpt_level": "N5",
  "partOfSpeech": "noun"
 },
 {
  "japanese": "持つ",
  "reading": "もつ",
  "english": "to hold (in one''s hand) / to take / to carry",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 }
]'::jsonb
where not exists (select 1 from starter_packs where name = 'JLPT N5 Kickstart Vol. 6');
