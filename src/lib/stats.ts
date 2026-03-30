export interface StatDirection {
  tries: number;
  pass: number;
  fail: number;
}

export interface GlobalStats {
  jp: StatDirection;
  en: StatDirection;
}

/**
 * Calculates global accuracy and attempt totals from an array of cards.
 */
export const calculateGlobalStats = (cards: any[]): GlobalStats => {
  return cards.reduce(
    (acc, card) => {
      const s = card.scores;
      if (s) {
        const jp = s.jp_to_en || { total: 0, pass: 0, fail: 0 };
        const en = s.en_to_jp || { total: 0, pass: 0, fail: 0 };

        acc.jp.tries += jp.total || 0;
        acc.jp.pass += jp.pass || 0;
        acc.jp.fail += jp.fail || 0;

        acc.en.tries += en.total || 0;
        acc.en.pass += en.pass || 0;
        acc.en.fail += en.fail || 0;
      }
      return acc;
    },
    {
      jp: { tries: 0, pass: 0, fail: 0 },
      en: { tries: 0, pass: 0, fail: 0 },
    }
  );
};