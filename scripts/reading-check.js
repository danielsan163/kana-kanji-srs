// Checks the tokenizer's (kuromoji's) reading of a word against the reading the app teaches for it.
// kuromoji picks one reading per token and sometimes picks the wrong one: 明後日 → みょうごにち instead
// of あさって, 後 → ご instead of あと, 五日 → ごにち instead of いつか.
const isKanji = (ch) => /[㐀-鿿々]/.test(ch);
const isKana = (ch) => /[ぁ-ゟ゠-ヿ]/.test(ch);
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Reading of the kanji part only: drops trailing okurigana, so 食べる/たべる → た and 食べ/たべ → た. */
function stemReading(surface, reading) {
  let s = [...surface], r = kataToHira(reading);
  while (s.length && isKana(s[s.length - 1]) && r.endsWith(kataToHira(s[s.length - 1]))) {
    r = r.slice(0, -1);
    s.pop();
  }
  return r;
}

// Rendaku: 気味 is きみ alone but ぎみ in 太り気味, so a voiced first sound still counts as the same reading
const unvoiceFirst = (r) => r.slice(0, 1).normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC') + r.slice(1);

/** Does the tokenizer's reading of `surface` agree with any of the vocab item's readings? */
function readingMatches(surface, reading, vocab) {
  const got = unvoiceFirst(stemReading(surface, reading));
  return vocab.r.some((r) => unvoiceFirst(stemReading(vocab.c, r)) === got);
}

/**
 * Is it safe to replace the tokenizer's reading with the word's own? Only for whole words of 2+ kanji
 * (明後日, 五日, 大勢). A single kanji is usually part of a compound (日 in 一日, 品 in 食料品), and words
 * with okurigana often have a second real reading (辛い: からい / つらい, 開く: あく / ひらく).
 * `before` / `after` are the neighbouring characters: a kanji there means the word is inside a longer one.
 */
function canFixReading(word, before = '', after = '') {
  return [...word].length >= 2 && [...word].every(isKanji) && !isKanji(before) && !isKanji(after);
}

/** JMdict spelling → every common reading across all its entries (一月: いちがつ "January" and ひとつき "one month"). */
function commonReadings(jm) {
  const map = new Map();
  for (const w of jm.words) for (const k of w.kanji) for (const r of w.kana) {
    if (!r.common || !(r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text))) continue;
    if (!map.has(k.text)) map.set(k.text, new Set());
    map.get(k.text).add(kataToHira(r.text));
  }
  return map;
}

module.exports = { isKanji, kataToHira, readingMatches, canFixReading, commonReadings };
