// Builds app/data/data.js and app/data/strokes.json from the raw sources in ./raw
// Run: npm run build-data
const fs = require('fs');
const path = require('path');
const kuromoji = require('kuromoji');

const RAW = path.join(__dirname, '..', 'raw');
const OUT = path.join(__dirname, '..', 'app', 'data');
fs.mkdirSync(OUT, { recursive: true });

const KANJI_PER_LEVEL = 20;
const VOCAB_PER_KANJI = 5;
const MAX_SENTENCE_LEN = 18;

const isKanji = (ch) => /[一-鿿々]/.test(ch) && ch !== '々';
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// ---------------------------------------------------------------- kana
const HIRA_BASIC = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
];
const HIRA_DAKU = [
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
];
const COMBO_BASES = [['き', 'k'], ['し', 'sh'], ['ち', 'ch'], ['に', 'n'], ['ひ', 'h'], ['み', 'm'], ['り', 'r'], ['ぎ', 'g'], ['じ', 'j'], ['び', 'b'], ['ぴ', 'p']];
const HIRA_COMBO = [];
for (const [k, r] of COMBO_BASES) {
  const y = ['sh', 'ch', 'j'].includes(r) ? '' : 'y';
  HIRA_COMBO.push([k + 'ゃ', r + y + 'a'], [k + 'ゅ', r + y + 'u'], [k + 'ょ', r + y + 'o']);
}
const KATA_EXT = [
  ['ファ', 'fa'], ['フィ', 'fi'], ['フェ', 'fe'], ['フォ', 'fo'], ['ティ', 'ti'], ['ディ', 'di'],
  ['ウィ', 'wi'], ['ウェ', 'we'], ['ヴ', 'vu'], ['シェ', 'she'], ['チェ', 'che'], ['ジェ', 'je'], ['ー', '-'],
];
// Extra accepted romanizations (answers are also checked by converting romaji → kana)
const KANA_ALT = { 'を': ['o'], 'ぢ': ['di', 'dji'], 'づ': ['du', 'dzu'], 'ん': ['nn'], 'ー': ['long vowel', 'dash'] };

const levels = [];
const items = [];
function kanaItem(c, romaji, script, lvl) {
  const hira = kataToHira(c);
  const alt = KANA_ALT[hira] || KANA_ALT[c] || [];
  items.push({ id: 'kana:' + c, t: 'kana', c, script, romaji: [romaji, ...alt], lvl });
}
levels.push({ n: 1, name: 'Hiragana', kind: 'kana' });
for (const [c, r] of [...HIRA_BASIC, ...HIRA_DAKU]) kanaItem(c, r, 'hiragana', 1);
levels.push({ n: 2, name: 'Katakana', kind: 'kana' });
for (const [c, r] of [...HIRA_BASIC, ...HIRA_DAKU]) kanaItem(hiraToKata(c), r, 'katakana', 2);
levels.push({ n: 3, name: 'Kana combinations', kind: 'kana' });
for (const [c, r] of HIRA_COMBO) kanaItem(c, r, 'hiragana', 3);
for (const [c, r] of HIRA_COMBO) kanaItem(hiraToKata(c), r, 'katakana', 3);
for (const [c, r] of KATA_EXT) kanaItem(c, r, 'katakana', 3);

// ---------------------------------------------------------------- kanji
const kd = JSON.parse(fs.readFileSync(path.join(RAW, 'kanji.json'), 'utf8'));
const kanjiList = Object.entries(kd)
  .filter(([, v]) => v.jlpt_new)
  .sort(([ca, a], [cb, b]) =>
    (b.jlpt_new - a.jlpt_new) || ((a.freq || 9999) - (b.freq || 9999)) || (a.strokes - b.strokes) || ca.localeCompare(cb));

const kanjiLevel = {};
let lvl = 4;
const JLPT_NAMES = { 5: 'N5', 4: 'N4', 3: 'N3', 2: 'N2', 1: 'N1' };
// Split each JLPT band into evenly sized levels of ~KANJI_PER_LEVEL so levels never straddle bands
const chunks = [];
for (const band of [5, 4, 3, 2, 1]) {
  const list = kanjiList.filter(([, v]) => v.jlpt_new === band);
  const n = Math.round(list.length / KANJI_PER_LEVEL) || 1;
  for (let i = 0; i < n; i++) chunks.push(list.slice(Math.round(i * list.length / n), Math.round((i + 1) * list.length / n)));
}
for (const chunk of chunks) {
  const jl = chunk[0][1].jlpt_new;
  levels.push({ n: lvl, name: 'JLPT ' + JLPT_NAMES[jl], kind: 'kanji' });
  for (const [c, v] of chunk) {
    kanjiLevel[c] = lvl;
    const cleanM = (m) => m.replace(/^[\^!]/, '').replace(/\s*radical\s*\(no\.?\s*\d+\)/i, '').trim();
    let meanings = [...(v.wk_meanings || []), ...v.meanings].map(cleanM);
    meanings = [...new Map(meanings.filter(Boolean).map((m) => [m.toLowerCase(), m])).values()];
    const kun = [...new Set((v.readings_kun || []).map((r) => r.replace(/-/g, '')).filter(Boolean))];
    const on = [...new Set((v.readings_on || []).map((r) => hiraToKata(r.replace(/-/g, ''))).filter(Boolean))];
    // readings WaniKani marks as primary (no leading "!")... use them to order display
    items.push({
      id: 'k:' + c, t: 'kanji', c, lvl, jlpt: v.jlpt_new, strokes: v.strokes,
      meanings, on, kun,
    });
  }
  lvl++;
}
const kanjiSet = new Set(Object.keys(kanjiLevel));
console.log('kanji:', kanjiSet.size, 'levels up to', lvl - 1);

// ---------------------------------------------------------------- vocab
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function splitMeanings(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if ((ch === ',' || ch === ';') && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((m) => m.trim()).filter(Boolean);
}

// JMdict: extra glosses for accepted answers + common flag
const jm = JSON.parse(fs.readFileSync(fs.readdirSync(RAW).filter((f) => f.startsWith('jmdict-eng')).map((f) => path.join(RAW, f))[0], 'utf8'));
const jmIndex = new Map(); // "kanji|kana" -> {gloss:[], common}
for (const w of jm.words) {
  const glosses = w.sense.slice(0, 3).flatMap((s) => s.gloss.map((g) => g.text));
  for (const k of w.kanji) {
    for (const r of w.kana) {
      if (!(r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text))) continue;
      const key = k.text + '|' + r.text;
      if (!jmIndex.has(key)) jmIndex.set(key, { gloss: glosses, common: k.common && r.common });
    }
  }
}

const vocabRaw = new Map();
for (const n of [5, 4, 3, 2, 1]) {
  const rows = parseCSV(fs.readFileSync(path.join(RAW, `n${n}.csv`), 'utf8')).slice(1);
  for (const [expr, reading, meaning] of rows) {
    if (!expr || !reading || !meaning) continue;
    const e = expr.trim();
    if (vocabRaw.has(e)) continue;
    const chars = [...e];
    const kan = [...new Set(chars.filter(isKanji))];
    if (!kan.length || !kan.every((k) => kanjiSet.has(k))) continue;
    if (/[a-zA-Z0-9０-９～〜・()（）]/.test(e)) continue;
    const readings = reading.replace(/\s*[（(][^)）]*[)）]/g, '').split(/[;、,／/]/).map((r) => kataToHira(r.trim())).filter((r) => /^[ぁ-ゟー]+$/.test(r));
    if (!readings.length) continue;
    const meanings = splitMeanings(meaning);
    const jmE = jmIndex.get(e + '|' + readings[0]) || jmIndex.get(e + '|' + hiraToKata(readings[0]));
    const alt = jmE ? jmE.gloss.filter((g) => !meanings.some((m) => m.toLowerCase() === g.toLowerCase())) : [];
    vocabRaw.set(e, { c: e, r: readings, meanings, alt, kanji: kan, jlpt: n, common: jmE ? jmE.common : false });
  }
}
// assign level = max kanji level, anchor = the latest kanji; cap per anchor
const byAnchor = new Map();
for (const v of vocabRaw.values()) {
  let anchor = v.kanji[0];
  for (const k of v.kanji) if (kanjiLevel[k] > kanjiLevel[anchor] || (kanjiLevel[k] === kanjiLevel[anchor] && kanjiList.findIndex(([c]) => c === k) > kanjiList.findIndex(([c]) => c === anchor))) anchor = k;
  v.lvl = kanjiLevel[anchor];
  if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
  byAnchor.get(anchor).push(v);
}
const vocab = [];
for (const [, list] of byAnchor) {
  list.sort((a, b) => (b.jlpt - a.jlpt) || (b.common - a.common) || (a.c.length - b.c.length));
  vocab.push(...list.slice(0, VOCAB_PER_KANJI));
}
const vocabByExpr = new Map(vocab.map((v) => [v.c, v]));
for (const v of vocab) {
  items.push({ id: 'v:' + v.c, t: 'vocab', c: v.c, lvl: v.lvl, jlpt: v.jlpt, r: v.r, meanings: v.meanings, alt: v.alt.slice(0, 8), kanji: v.kanji });
}
console.log('vocab:', vocab.length, 'of', vocabRaw.size, 'candidates');

// ---------------------------------------------------------------- sentences
function loadTsv(file) {
  return fs.readFileSync(path.join(RAW, file), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
}

kuromoji.builder({ dicPath: path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict') }).build((err, tokenizer) => {
  if (err) throw err;
  const eng = new Map();
  const links = new Map();
  for (const [j, e] of loadTsv('jpn-eng_links.tsv')) { if (!links.has(j)) links.set(j, []); links.get(j).push(e); }
  const neededEng = new Set([...links.values()].flat());
  for (const [id, , text] of loadTsv('eng_sentences.tsv')) if (neededEng.has(id)) eng.set(id, text);

  const candidates = [];
  for (const [id, , text] of loadTsv('jpn_sentences.tsv')) {
    if (!text || text.length < 5 || text.length > MAX_SENTENCE_LEN) continue;
    if (/[A-Za-z0-9０-９Ａ-Ｚａ-ｚ「」『』（）()・…〜～]/.test(text)) continue;
    const kan = [...new Set([...text].filter(isKanji))];
    if (!kan.length || !kan.every((k) => kanjiSet.has(k))) continue;
    const en = (links.get(id) || []).map((e) => eng.get(e)).filter(Boolean);
    if (!en.length) continue;
    candidates.push({ id, text, kan, en: en.sort((a, b) => a.length - b.length)[0] });
  }
  console.log('sentence candidates:', candidates.length);

  const byLevel = new Map();
  for (const s of candidates) {
    const toks = tokenizer.tokenize(s.text);
    let ok = true, known = 0, words = 0, lvlMax = Math.max(...s.kan.map((k) => kanjiLevel[k]));
    const tokens = [];
    const wordList = [];
    for (const t of toks) {
      const surface = t.surface_form;
      const hasK = [...surface].some(isKanji);
      let reading = t.reading && t.reading !== '*' ? kataToHira(t.reading) : null;
      if (hasK && !reading) { ok = false; break; }
      if (!hasK) reading = /^[ぁ-ゟ゠-ヿ]+$/.test(surface) ? kataToHira(surface) : '';
      const particle = t.pos === '助詞' && ['は', 'へ', 'を'].includes(surface);
      tokens.push(particle ? [surface, reading, 1] : [surface, reading]);
      if (hasK) {
        words++;
        const v = vocabByExpr.get(t.basic_form) || vocabByExpr.get(surface);
        if (v) { known++; lvlMax = Math.max(lvlMax, v.lvl); if (!wordList.includes(v.c)) wordList.push(v.c); }
      }
    }
    if (!ok || words === 0) continue;
    // Require most kanji words to be studied vocab so the sentence is readable
    if (known / words < 0.75) continue;
    const score = known / words * 10 - s.text.length * 0.2 + (s.en.length < 60 ? 1 : -3);
    if (!byLevel.has(lvlMax)) byLevel.set(lvlMax, []);
    byLevel.get(lvlMax).push({ id: 's:' + s.id, t: 'sentence', c: s.text, lvl: lvlMax, tokens, en: s.en, kanji: s.kan, words: wordList, score });
  }
  let sCount = 0;
  for (const [lv, list] of byLevel) {
    list.sort((a, b) => b.score - a.score);
    const take = lv < 24 ? 3 : 2;
    const seen = new Set();
    for (const s of list) {
      if (seen.size >= take) break;
      if ([...seen].some((x) => x.slice(0, 4) === s.c.slice(0, 4))) continue; // avoid near-duplicates
      seen.add(s.c);
      delete s.score;
      items.push(s);
      sCount++;
    }
  }
  console.log('sentences:', sCount);

  // ---------------------------------------------------------------- strokes
  const strokes = {};
  for (const c of kanjiSet) {
    const f = path.join(RAW, 'kanjivg', 'kanji', c.codePointAt(0).toString(16).padStart(5, '0') + '.svg');
    if (!fs.existsSync(f)) continue;
    const svg = fs.readFileSync(f, 'utf8');
    strokes[c] = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  }
  fs.writeFileSync(path.join(OUT, 'strokes.json'), JSON.stringify(strokes));
  console.log('stroke diagrams:', Object.keys(strokes).length);

  fs.writeFileSync(path.join(OUT, 'data.js'), '// Generated by scripts/build-data.js — do not edit\nwindow.SRS_DATA = ' + JSON.stringify({ levels, items }) + ';\n');
  console.log('items total:', items.length, 'levels:', levels.length);
});
