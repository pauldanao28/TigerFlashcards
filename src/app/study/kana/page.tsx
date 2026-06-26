import { HIRAGANA_DATA, KATAKANA_DATA } from "@/lib/kana";
import KanaStudyClient from "@/components/KanaStudyClient";

export default function KanaPage() {
  const hiragana = HIRAGANA_DATA.filter((c) => c.jp);
  const katakana = KATAKANA_DATA.filter((c) => c.jp);

  return (
    <>
      {/* Interactive study app — client-rendered */}
      <KanaStudyClient />

      {/* Server-rendered kana reference — indexed by crawlers, hidden visually */}
      <section
        aria-label="Hiragana and Katakana complete reference chart"
        className="sr-only"
      >
        <h2>Complete Hiragana Chart</h2>
        <p>
          Hiragana (ひらがな) is the primary Japanese syllabary used for native
          Japanese words and grammatical particles. There are 46 basic hiragana
          characters.
        </p>
        <table>
          <caption>Hiragana characters with romaji pronunciation</caption>
          <thead>
            <tr>
              <th>Hiragana</th>
              <th>Romaji (pronunciation)</th>
            </tr>
          </thead>
          <tbody>
            {hiragana.map((c) => (
              <tr key={c.jp}>
                <td>{c.jp}</td>
                <td>{c.romaji}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Complete Katakana Chart</h2>
        <p>
          Katakana (カタカナ) is the Japanese syllabary used for foreign
          loanwords, technical terms, and emphasis. There are 46 basic katakana
          characters, each corresponding to a hiragana sound.
        </p>
        <table>
          <caption>Katakana characters with romaji pronunciation</caption>
          <thead>
            <tr>
              <th>Katakana</th>
              <th>Romaji (pronunciation)</th>
            </tr>
          </thead>
          <tbody>
            {katakana.map((c) => (
              <tr key={c.jp}>
                <td>{c.jp}</td>
                <td>{c.romaji}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>How to Study Hiragana and Katakana</h2>
        <p>
          Use FlashKado&apos;s interactive kana study tool to quiz yourself on
          all 46 hiragana and 46 katakana characters. Each character card plays
          the correct Japanese pronunciation using text-to-speech audio. Shuffle
          the deck and practice until you can recognize every character
          instantly.
        </p>
        <ul>
          <li>あ (a), い (i), う (u), え (e), お (o)</li>
          <li>か (ka), き (ki), く (ku), け (ke), こ (ko)</li>
          <li>さ (sa), し (shi), す (su), せ (se), そ (so)</li>
          <li>た (ta), ち (chi), つ (tsu), て (te), と (to)</li>
          <li>な (na), に (ni), ぬ (nu), ね (ne), の (no)</li>
          <li>は (ha), ひ (hi), ふ (fu), へ (he), ほ (ho)</li>
          <li>ま (ma), み (mi), む (mu), め (me), も (mo)</li>
          <li>や (ya), ゆ (yu), よ (yo)</li>
          <li>ら (ra), り (ri), る (ru), れ (re), ろ (ro)</li>
          <li>わ (wa), を (wo), ん (n)</li>
        </ul>
      </section>
    </>
  );
}
