// Builds app/data/examples.json (reference-only content, not reviewed):
//   - up to 5 short, easy example sentences (with English) for each vocab word
//   - the 5 most common words containing each kanji
// Run after build-data.js: npm run build-data
const fs = require('fs');
const path = require('path');
const kuromoji = require('kuromoji');

const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(__dirname, '..', 'app', 'data');
const EXAMPLES_PER_VOCAB = 5;
const WORDS_PER_KANJI = 5;
const MAX_LEN = 28;

global.window = {};
require(path.join(OUT, 'data.js'));
const { items } = window.SRS_DATA;

const isKanji = (ch) => /[一-鿿]/.test(ch);
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const tsv = (f) => fs.readFileSync(path.join(RAW, f), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));

const kanjiLevel = {};
for (const it of items) if (it.t === 'kanji') kanjiLevel[it.c] = it.lvl;
const vocab = items.filter((it) => it.t === 'vocab');
const vocabByWord = new Map(vocab.map((v) => [v.c, v]));
// Pure-kanji words (日本, 会社) are matched as substrings; words with okurigana (食べる) via the tokenizer's dictionary form
const firstCharIndex = new Map();
for (const v of vocab) {
  if (![...v.c].every(isKanji) || v.c.length < 2) continue;
  if (!firstCharIndex.has(v.c[0])) firstCharIndex.set(v.c[0], []);
  firstCharIndex.get(v.c[0]).push(v.c);
}

// ---------------------------------------------------------------- corpus
const eng = new Map();
const firstEng = new Map();
for (const [j, e] of tsv('jpn-eng_links.tsv')) if (!firstEng.has(j)) firstEng.set(j, e);
const neededEng = new Set(firstEng.values());
for (const [id, , text] of tsv('eng_sentences.tsv')) if (neededEng.has(id)) eng.set(id, text);
const corpus = [];
for (const [id, , text] of tsv('jpn_sentences.tsv')) {
  const en = eng.get(firstEng.get(id));
  if (!en || !text) continue;
  corpus.push({ id, text, en });
}
console.log('corpus sentences with English:', corpus.length);

kuromoji.builder({ dicPath: path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict') }).build((err, tokenizer) => {
  if (err) throw err;
  const tokenFreq = new Map();       // dictionary form → occurrences (frequency proxy)
  const kanjiSentences = new Map();  // kanji → sentence indices (for substring frequency)
  const matches = new Map();         // vocab word → [{ si, i0, i1, score }]
  const addMatch = (w, m) => { if (!matches.has(w)) matches.set(w, []); matches.get(w).push(m); };

  corpus.forEach((s, si) => {
    for (const ch of new Set(s.text)) {
      if (!isKanji(ch)) continue;
      if (!kanjiSentences.has(ch)) kanjiSentences.set(ch, []);
      kanjiSentences.get(ch).push(si);
    }
    const toks = tokenizer.tokenize(s.text);
    for (const t of toks) {
      const f = t.basic_form !== '*' ? t.basic_form : t.surface_form;
      tokenFreq.set(f, (tokenFreq.get(f) || 0) + 1);
    }
    // Only short, clean sentences are candidates for display
    if (s.text.length < 4 || s.text.length > MAX_LEN || /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/.test(s.text)) return;
    const kan = [...new Set([...s.text].filter(isKanji))];
    const unknown = kan.filter((k) => !kanjiLevel[k]).length;
    const maxLvl = Math.max(0, ...kan.map((k) => kanjiLevel[k] || 0));
    const offsets = [];
    let pos = 0;
    for (const t of toks) { offsets.push(pos); pos += t.surface_form.length; }
    const tokenAt = (charPos) => { let i = 0; while (i + 1 < offsets.length && offsets[i + 1] <= charPos) i++; return i; };
    const found = new Map();
    toks.forEach((t, i) => {
      for (const f of [t.basic_form, t.surface_form]) if (vocabByWord.has(f) && !found.has(f)) found.set(f, [i, i]);
    });
    for (let p = 0; p < s.text.length; p++) {
      for (const w of firstCharIndex.get(s.text[p]) || []) {
        if (!found.has(w) && s.text.startsWith(w, p)) found.set(w, [tokenAt(p), tokenAt(p + w.length - 1)]);
      }
    }
    for (const [w, [i0, i1]] of found) {
      const v = vocabByWord.get(w);
      const score = s.text.length * 0.6 + Math.max(0, maxLvl - v.lvl) * 0.8 + unknown * 12 + (s.text.length < 6 ? 4 : 0);
      addMatch(w, { si, i0, i1, score });
    }
  });

  // ---------------------------------------------------------------- vocab examples
  const usedSentences = new Map(); // corpus index → output index
  const outSentences = [];
  const outVocab = {};
  const norm = (t) => t.replace(/[。、！？!?「」『』…\s]/g, '');
  for (const v of vocab) {
    const list = (matches.get(v.c) || []).sort((a, b) => a.score - b.score);
    const chosen = [];
    const seen = [];
    for (const m of list) {
      if (chosen.length >= EXAMPLES_PER_VOCAB) break;
      const t = norm(corpus[m.si].text);
      if (seen.some((x) => x === t || x.slice(0, 5) === t.slice(0, 5))) continue;
      seen.push(t);
      if (!usedSentences.has(m.si)) {
        const s = corpus[m.si];
        const tokens = tokenizer.tokenize(s.text).map((tk) => {
          const hasK = [...tk.surface_form].some(isKanji);
          const r = hasK && tk.reading && tk.reading !== '*' ? kataToHira(tk.reading) : '';
          return r ? [tk.surface_form, r] : [tk.surface_form];
        });
        usedSentences.set(m.si, outSentences.length);
        outSentences.push([tokens, s.en, +s.id]);
      }
      chosen.push([usedSentences.get(m.si), m.i0, m.i1]);
    }
    if (chosen.length) outVocab[v.c] = chosen;
  }
  const covered = Object.keys(outVocab).length;
  const five = Object.values(outVocab).filter((l) => l.length >= 5).length;
  console.log(`vocab with examples: ${covered}/${vocab.length} (${five} with 5) · sentences stored: ${outSentences.length}`);

  // ---------------------------------------------------------------- common words per kanji
  const jmFile = fs.readdirSync(RAW).find((f) => f.startsWith('jmdict-eng'));
  const jm = JSON.parse(fs.readFileSync(path.join(RAW, jmFile), 'utf8'));
  const candidates = new Map(); // word → { r, m }
  for (const w of jm.words) {
    for (const k of w.kanji) {
      if (!k.common || ![...k.text].some(isKanji)) continue;
      const kana = w.kana.find((r) => r.common && (r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text))) || w.kana[0];
      const sense = w.sense.find((s) => s.appliesToKanji.includes('*') || s.appliesToKanji.includes(k.text)) || w.sense[0];
      if (!kana || !sense || candidates.has(k.text)) continue;
      candidates.set(k.text, { r: kataToHira(kana.text), m: sense.gloss.slice(0, 3).map((g) => g.text).join('; ') });
    }
  }
  for (const v of vocab) if (!candidates.has(v.c)) candidates.set(v.c, { r: v.r[0], m: v.meanings.slice(0, 3).join('; ') });

  const freqCache = new Map();
  function frequency(w) {
    if (freqCache.has(w)) return freqCache.get(w);
    let f;
    if ([...w].every(isKanji) && w.length > 1) {
      // substring count over sentences containing the word's rarest kanji
      const lists = [...w].map((k) => kanjiSentences.get(k) || []);
      const base = lists.reduce((a, b) => (a.length <= b.length ? a : b));
      f = 0;
      for (const si of base) if (corpus[si].text.includes(w)) f++;
    } else f = tokenFreq.get(w) || 0;
    freqCache.set(w, f);
    return f;
  }
  const byKanji = new Map();
  for (const w of candidates.keys()) for (const ch of new Set(w)) if (kanjiLevel[ch]) {
    if (!byKanji.has(ch)) byKanji.set(ch, []);
    byKanji.get(ch).push(w);
  }
  const outKanji = {};
  for (const ch of Object.keys(kanjiLevel)) {
    const ws = (byKanji.get(ch) || [])
      .map((w) => [w, frequency(w) + (vocabByWord.has(w) ? 0.5 : 0)])
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
      .slice(0, WORDS_PER_KANJI)
      .map(([w]) => [w, candidates.get(w).r, candidates.get(w).m]);
    if (ws.length) outKanji[ch] = ws;
  }
  console.log(`kanji with common words: ${Object.keys(outKanji).length}/${Object.keys(kanjiLevel).length}`);

  fs.writeFileSync(path.join(OUT, 'examples.json'), JSON.stringify({ s: outSentences, v: outVocab, k: outKanji }));
  console.log('examples.json:', (fs.statSync(path.join(OUT, 'examples.json')).size / 1e6).toFixed(1), 'MB');
});
