-- Fill the N5 gap in the existing starter packs (no new pack): 114 N5 words no pack had.
-- 7 had been added to a deck by hand (降る, 思う, 旅行, 日本人, 単語, 本当, 週); the rest are from
-- Jisho's #jlpt-n5 list (持つ, 住む, 結婚, 動物 …), in kana where Jisho says it's usually written so.
-- Verbs and adjectives → N5 Vol. 4, everything else → N5 Vol. 5. Takes the N5 packs from 782 to
-- 896 distinct words (target 800, src/lib/scoring.ts). Run after 20261016000000. Safe to re-run.
-- People who already imported these packs get an "Add new words" button on the Cards page.
-- Example sentences: run the backfill-examples admin endpoint once the words are in decks.

-- JLPT N5 Kickstart Vol. 4: +19 (降る, 思う, 強い, 上る, 止まる, 弱い, 丈夫, 細い, 太い, 住む, 死ぬ, 渡る, 晴れる, 並ぶ, うるさい, つまらない, こんな, ぬるい, 持つ)
update starter_packs set card_data = card_data || '[
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
  "japanese": "強い",
  "reading": "つよい",
  "english": "strong / potent / competent",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "上る",
  "reading": "のぼる",
  "english": "to ascend / to go up / to climb",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "止まる",
  "reading": "とまる",
  "english": "to stop (moving) / to come to a stop",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 },
 {
  "japanese": "弱い",
  "reading": "よわい",
  "english": "weak / frail / delicate",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
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
  "japanese": "こんな",
  "reading": "こんな",
  "english": "this sort of / this kind of / like this",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "ぬるい",
  "reading": "ぬるい",
  "english": "lukewarm / tepid",
  "jlpt_level": "N5",
  "partOfSpeech": "adjective"
 },
 {
  "japanese": "持つ",
  "reading": "もつ",
  "english": "to hold (in one''s hand) / to take / to carry",
  "jlpt_level": "N5",
  "partOfSpeech": "verb"
 }
]'::jsonb
where id = '7b5da3be-8987-4b95-9c51-ff3fd858bb94' and not card_data @> '[{"japanese": "降る"}]'::jsonb;

-- JLPT N5 Kickstart Vol. 5: +95 (旅行, 日本人, 単語, 本当, 週, タバコ, 年, 昨夜, 庭, 警官, 隣, 番号, 果物, 洋服, 横, 留学生, 一昨年, 結婚, どなた, なぜ, しかし, 奥さん, だんだん, 夕飯, はがき, ワイシャツ, おまわりさん, 二十日, キロメートル, 再来年, マッチ, 背, プール, ニュース, カメラ, ラジオ, レストラン, ナイフ, ネクタイ, ギター, メートル, セーター, バター, レコード, ポスト, コピー, シャワー, ハンカチ, テープ, ストーブ, カップ, スリッパ, ペット, テープレコーダー, 動物, 九日, 門, もっと, パーティー, 誰か, どうぞ, ゆっくり, さあ, どうも, じゃあ, それでは, では, フィルム, カレンダー, そうして, グラム, キログラム, 字引, コート, フォーク, ラジカセ, 村, 自動車, 雑誌, 塩, 夏休み, 切手, 作文, 紅茶, 風呂, 封筒, 牛肉, 交差点, 茶碗, 万年筆, 灰皿, 豚肉, 交番, 花瓶, 八百屋)
update starter_packs set card_data = card_data || '[
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
  "japanese": "昨夜",
  "reading": "ゆうべ",
  "english": "last night / yesterday evening",
  "jlpt_level": "N5",
  "partOfSpeech": "adverb"
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
  "partOfSpeech": "noun"
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
  "partOfSpeech": "noun"
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
  "partOfSpeech": "noun"
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
 }
]'::jsonb
where id = 'a7dffbee-871d-47d5-aa6f-d7cffb4ff624' and not card_data @> '[{"japanese": "旅行"}]'::jsonb;

-- Word counts in the descriptions
update starter_packs
set description = regexp_replace(description, '\(\d+ words\)', '(' || jsonb_array_length(card_data) || ' words)')
where id in ('7b5da3be-8987-4b95-9c51-ff3fd858bb94', 'a7dffbee-871d-47d5-aa6f-d7cffb4ff624');
