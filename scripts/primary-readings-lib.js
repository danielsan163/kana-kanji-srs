// Pure logic for scripts/primary-readings.js: works out which reading each kanji takes inside a word,
// adds those up by word frequency and picks each kanji's primary reading(s). No file access here, so
// test/primary-readings.test.js can check it with small hand-made inputs.

const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const isKana = (ch) => /[ぁ-ゟ゠-ヿ]/.test(ch);
const isKanji = (ch) => /[㐀-鿿豈-﫿]/.test(ch) || ch === '々';

// Second reading is kept when it has at least (1 - THRESHOLD) of the top reading's weight
const DEFAULT_THRESHOLD = 0.25;
const MAX_PRIMARY = 2;

// ------------------------------------------------------------------ readings a kanji can take in a word
const VOICED = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const HALF_VOICED = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const I_ROW = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };

/**
 * One kanji's KANJIDIC readings as candidates. Each candidate has a key (what gets counted) and the
 * spellings the kanji itself can cover in a word. Kun'yomi are keyed by their stem, so 大きい and 大いに
 * both count toward おお. The stem can also take part of its okurigana when a word leaves it unwritten:
 * 受付 (う + け of う.ける), 話 (はな + し, the noun form of はな.す).
 */
function candidates(on, kun) {
  const out = [];
  for (const r of on) {
    const h = kataToHira(r.replace(/-/g, ''));
    if (h) out.push({ key: 'on:' + h, type: 'on', reading: h, forms: [h] });
  }
  const byStem = new Map();
  const onSounds = new Set(out.map((c) => c.reading));
  for (const r of kun) {
    const [stem, oku = ''] = r.replace(/-/g, '').split('.');
    // A kun'yomi stem that sounds the same as an on'yomi can't be told apart in a word (気's き is listed
    // as both, 死ぬ is シ or し.ぬ), so those words count toward the on'yomi
    if (!stem || onSounds.has(stem)) continue;
    if (!byStem.has(stem)) byStem.set(stem, new Set([stem]));
    const forms = byStem.get(stem);
    for (let j = 1; j <= oku.length; j++) forms.add(stem + oku.slice(0, j));
    const last = oku.slice(-1);
    if (I_ROW[last]) forms.add(stem + oku.slice(0, -1) + I_ROW[last]);
  }
  // A form that KANJIDIC also lists as its own reading belongs to that reading (話: はなし is listed, so
  // はな.す doesn't also claim it), otherwise every such word would be ambiguous
  for (const [stem, forms] of byStem) {
    out.push({ key: 'kun:' + stem, type: 'kun', reading: stem, forms: [...forms].filter((f) => f === stem || !byStem.has(f)) });
  }
  return out;
}

/** Sound changes inside a word: rendaku (人 → びと) after the first kanji, small っ (学 → がっ) before another kanji. */
function variants(form, { first, beforeKanji }) {
  const out = new Set([form]);
  if (!first) {
    const c = form[0];
    if (VOICED[c]) out.add(VOICED[c] + form.slice(1));
    if (HALF_VOICED[c]) out.add(HALF_VOICED[c] + form.slice(1));
  }
  if (beforeKanji && form.length > 1 && 'つちくき'.includes(form.slice(-1))) {
    for (const v of [...out]) out.add(v.slice(0, -1) + 'っ');
  }
  return [...out];
}

// ------------------------------------------------------------------ word alignment
const MAX_ALIGNMENTS = 64;

/**
 * Every way to split a word's reading over its characters. Written kana must match the reading as is;
 * each kanji takes one of its candidate spellings. Returns a list of alignments, each a list of
 * { ch, key } for the word's kanji in order. 々 repeats the kanji before it.
 * `cands` maps a kanji to candidates(); a kanji with no entry makes the word unalignable.
 */
function align(written, reading, cands) {
  const chars = [...written].map((ch, i, a) => (ch === '々' && i > 0 ? a[i - 1] : ch));
  const r = kataToHira(reading);
  const out = [];
  (function walk(i, pos, acc) {
    if (out.length >= MAX_ALIGNMENTS) return;
    if (i === chars.length) { if (pos === r.length) out.push(acc); return; }
    const ch = chars[i];
    if (isKana(ch)) {
      if (kataToHira(ch) === r[pos]) walk(i + 1, pos + 1, acc);
      return;
    }
    const cs = cands.get(ch);
    if (!cs) return;
    const opts = { first: i === 0, beforeKanji: i + 1 < chars.length && !isKana(chars[i + 1]) };
    for (const c of cs) {
      const tried = new Set();
      for (const f of c.forms) for (const v of variants(f, opts)) {
        if (tried.has(v) || !r.startsWith(v, pos)) continue;
        tried.add(v);
        walk(i + 1, pos + v.length, [...acc, { ch, key: c.key }]);
      }
    }
  })(0, 0, []);
  return out;
}

/**
 * The reading key `kanji` takes in this word, or null when the word can't be split (jukujikun like
 * 今日, or a reading KANJIDIC doesn't list) or the split is ambiguous.
 */
function readingInWord(kanji, written, reading, cands) {
  const keys = new Set();
  for (const a of align(written, reading, cands)) {
    const mine = a.filter((x) => x.ch === kanji).map((x) => x.key);
    if (!mine.length) continue;
    for (const k of mine) keys.add(k);
  }
  return keys.size === 1 ? [...keys][0] : null;
}

// ------------------------------------------------------------------ counting and picking
/**
 * Add up each course kanji's readings over the words that contain it.
 * words: [{ written, reading, weight }]. Returns Map kanji → { counts: Map key → weight,
 * examples: Map key → [{ written, reading, weight }], words, unaligned }.
 */
function tally(courseKanji, words, cands, { examplesPerReading = 3 } = {}) {
  const course = new Set(courseKanji);
  const out = new Map(courseKanji.map((k) => [k, { counts: new Map(), examples: new Map(), words: 0, unaligned: 0 }]));
  for (const w of words) {
    const seen = new Set();
    for (const ch of w.written) {
      if (!course.has(ch) || seen.has(ch)) continue;
      seen.add(ch);
      const t = out.get(ch);
      const key = readingInWord(ch, w.written, w.reading, cands);
      if (!key) { t.unaligned++; continue; }
      t.words++;
      t.counts.set(key, (t.counts.get(key) || 0) + w.weight);
      if (!t.examples.has(key)) t.examples.set(key, []);
      t.examples.get(key).push({ written: w.written, reading: w.reading, weight: w.weight });
    }
  }
  for (const t of out.values()) {
    for (const [key, list] of t.examples) {
      list.sort((a, b) => b.weight - a.weight);
      t.examples.set(key, list.slice(0, examplesPerReading));
    }
  }
  return out;
}

/** Top reading, plus the runner-up when it's within `threshold` of it. Never more than two. */
function pickPrimary(counts, threshold = DEFAULT_THRESHOLD) {
  const ranked = [...counts].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return [];
  const keys = [ranked[0][0]];
  if (ranked[1] && ranked[1][1] >= ranked[0][1] * (1 - threshold)) keys.push(ranked[1][0]);
  return keys.slice(0, MAX_PRIMARY);
}

/** 'on:せい' → { reading: 'セイ', type: 'on' }; 'kun:い' → { reading: 'い', type: 'kun' }. On'yomi in katakana like the app shows them. */
function keyToEntry(key) {
  const [type, r] = key.split(':');
  return { reading: type === 'on' ? hiraToKata(r) : r, type };
}

/** Kanji no word could be split for: first on'yomi, else first kun'yomi stem. */
function fallbackPrimary(on, kun) {
  const c = candidates(on, kun);
  const pick = c.find((x) => x.type === 'on') || c[0];
  return pick ? [keyToEntry(pick.key)] : [];
}

/**
 * Final primary readings: the derived ones, with every override replacing its kanji's entry.
 * Overrides whose readings the kanji doesn't have are reported in `problems` and skipped.
 */
function applyOverrides(derived, overrides, readingsOf) {
  const out = { ...derived };
  const problems = [];
  for (const [k, list] of Object.entries(overrides || {})) {
    if (k.startsWith('_')) continue; // "_comment" and similar notes
    if (!Array.isArray(list) || !list.length || list.length > MAX_PRIMARY) { problems.push(`${k}: needs 1 or 2 readings`); continue; }
    const known = readingsOf ? readingsOf(k) : null;
    const bad = list.filter((e) => !['on', 'kun'].includes(e.type) || !e.reading ||
      (known && !candidates(known.on, known.kun).some((c) => c.key === entryKey(e))));
    if (bad.length) { problems.push(`${k}: unknown reading ${bad.map((e) => JSON.stringify(e)).join(', ')}`); continue; }
    out[k] = list.map((e) => ({ reading: e.type === 'on' ? hiraToKata(e.reading) : kataToHira(e.reading.split('.')[0]), type: e.type }));
  }
  return { primary: out, problems };
}
const entryKey = (e) => e.type + ':' + kataToHira(e.type === 'kun' ? e.reading.split('.')[0] : e.reading);

module.exports = {
  DEFAULT_THRESHOLD, MAX_PRIMARY, kataToHira, hiraToKata, isKanji,
  candidates, variants, align, readingInWord, tally, pickPrimary, keyToEntry, fallbackPrimary, applyOverrides,
};
