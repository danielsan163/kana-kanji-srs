// Derives each course kanji's primary reading(s) from how often its readings appear in common words.
//
//   npm run primary-readings            → scripts/primary-readings/derived.json + doubles.csv (for review)
//   npm run primary-readings -- --apply → merges derived.json + overrides.json into app/data/primary-readings.js
//
// Options: --threshold 0.25 (how close the runner-up must be to also count as primary)
// Inputs (in raw/, not in git): kanjidic2.xml, jmdict-eng-common-*.json, ja-wordfreq.tsv
// (from scripts/export-wordfreq.py). The course kanji list comes from app/data/data.js.
// overrides.json is never written by this script, so hand edits there survive every re-run.
const fs = require('fs');
const path = require('path');
const L = require('./primary-readings-lib');

const ROOT = path.join(__dirname, '..');
// Every file location, so the tests can run the whole thing in a temporary folder
const PATHS = {
  raw: path.join(ROOT, 'raw'),
  dataFile: path.join(ROOT, 'app', 'data', 'data.js'),
  dir: path.join(__dirname, 'primary-readings'),        // derived.json, doubles.csv, overrides.json
  appFile: path.join(ROOT, 'app', 'data', 'primary-readings.js'),
};
const files = (P) => ({ derived: path.join(P.dir, 'derived.json'), doubles: path.join(P.dir, 'doubles.csv'), overrides: path.join(P.dir, 'overrides.json') });

function courseKanji(dataFile) {
  const src = fs.readFileSync(dataFile, 'utf8');
  const json = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  return JSON.parse(json).items.filter((it) => it.t === 'kanji');
}

/** KANJIDIC2 → Map literal → { on, kun } (on'yomi in katakana, kun'yomi with KANJIDIC's "." and "-"). */
function loadKanjidic(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = new Map();
  for (const m of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const literal = (m[1].match(/<literal>([^<]+)<\/literal>/) || [])[1];
    if (!literal) continue;
    const on = [...m[1].matchAll(/<reading r_type="ja_on"[^>]*>([^<]+)<\/reading>/g)].map((x) => x[1]);
    const kun = [...m[1].matchAll(/<reading r_type="ja_kun"[^>]*>([^<]+)<\/reading>/g)].map((x) => x[1]);
    out.set(literal, { on, kun });
  }
  return out;
}

/** Tab-separated word → frequency (any linear scale; only ratios matter). */
function loadFreq(file) {
  const freq = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [w, f] = line.split('\t');
    const n = parseFloat(f);
    if (w && n > 0 && !freq.has(w)) freq.set(w, n);
  }
  return freq;
}

const IRREGULAR = ['ik', 'iK', 'ok', 'oK', 'rk', 'rK', 'sk', 'sK', 'ateji', 'io'];
/**
 * Common JMdict spellings with their common readings. Each spelling's frequency is shared between its
 * readings (一日: いちにち / ついたち), since the frequency list can't tell them apart. Spellings missing
 * from the list get the list's smallest frequency so they still count a little.
 */
function loadWords(file, freq) {
  const jm = JSON.parse(fs.readFileSync(file, 'utf8'));
  const floor = Math.min(...freq.values());
  const readings = new Map(); // spelling → its readings across every JMdict entry (人: ひと, じん, にん)
  for (const w of jm.words) {
    for (const k of w.kanji) {
      if (!k.common || k.tags.some((t) => IRREGULAR.includes(t))) continue;
      const rs = w.kana.filter((r) => r.common && !r.tags.some((t) => IRREGULAR.includes(t)) &&
        (r.appliesToKanji.includes('*') || r.appliesToKanji.includes(k.text)));
      if (!readings.has(k.text)) readings.set(k.text, new Set());
      for (const r of rs) readings.get(k.text).add(L.kataToHira(r.text));
    }
  }
  const words = [];
  for (const [written, rs] of readings) {
    const weight = (freq.get(written) || floor) / (rs.size || 1);
    for (const reading of rs) words.push({ written, reading, weight });
  }
  return words;
}

function findRaw(raw, prefix) {
  const f = fs.existsSync(raw) && fs.readdirSync(raw).find((x) => x.startsWith(prefix));
  if (!f) throw new Error(`Missing raw/${prefix}… (see the header of scripts/primary-readings.js)`);
  return path.join(raw, f);
}

function derive({ threshold = L.DEFAULT_THRESHOLD, log = console.log, ...paths } = {}) {
  const P = { ...PATHS, ...paths };
  const F = files(P);
  const kd = loadKanjidic(findRaw(P.raw, 'kanjidic2'));
  const freq = loadFreq(findRaw(P.raw, 'ja-wordfreq'));
  const words = loadWords(findRaw(P.raw, 'jmdict-eng'), freq);
  const course = courseKanji(P.dataFile);
  const cands = new Map([...kd].map(([k, v]) => [k, L.candidates(v.on, v.kun)]));
  const t = L.tally(course.map((it) => it.c), words, cands);

  const kanji = {};
  for (const it of course) {
    const r = t.get(it.c);
    // Only readings the app shows (and accepts) can be primary
    const shown = new Set(L.candidates(it.on, it.kun).map((c) => c.key));
    const counts = new Map([...r.counts].filter(([k]) => shown.has(k)));
    const keys = L.pickPrimary(counts, threshold);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    kanji[it.c] = {
      primary: keys.length ? keys.map(L.keyToEntry) : L.fallbackPrimary(it.on, it.kun),
      source: keys.length ? 'derived' : 'fallback',
      words: r.words, unaligned: r.unaligned,
      // share of the weighted count per reading, biggest first
      share: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).map(([k, w]) => [k, +(w / total).toFixed(3)])),
      examples: Object.fromEntries(keys.map((k) => [k, (r.examples.get(k) || []).map((e) => `${e.written}（${e.reading}）`)])),
    };
  }
  fs.mkdirSync(P.dir, { recursive: true });
  fs.writeFileSync(F.derived, JSON.stringify({ threshold, generated: new Date().toISOString().slice(0, 10), kanji }, null, 1) + '\n');

  const doubles = Object.entries(kanji).filter(([, v]) => v.primary.length === 2);
  const csv = ['kanji,reading 1,share 1,examples 1,reading 2,share 2,examples 2'];
  for (const [k, v] of doubles) {
    const keys = Object.keys(v.examples);
    csv.push([k, ...keys.flatMap((key) => [L.keyToEntry(key).reading, v.share[key], v.examples[key].join(' ')])].map((x) => `"${x}"`).join(','));
  }
  fs.writeFileSync(F.doubles, csv.join('\n') + '\n');

  const fallback = Object.values(kanji).filter((v) => v.source === 'fallback').length;
  log(`words: ${words.length}, kanji: ${course.length}`);
  log(`two primary readings: ${doubles.length} of ${course.length} kanji`);
  log(`no usable words (first on'yomi used instead): ${fallback}`);
  log(`wrote ${path.relative(ROOT, F.derived)} and ${path.relative(ROOT, F.doubles)}. Review them, then run with --apply`);
  return { kanji, doubles: doubles.length, total: course.length, fallback };
}

function apply({ log = console.log, ...paths } = {}) {
  const P = { ...PATHS, ...paths };
  const F = files(P);
  const derived = JSON.parse(fs.readFileSync(F.derived, 'utf8')).kanji;
  const overrides = fs.existsSync(F.overrides) ? JSON.parse(fs.readFileSync(F.overrides, 'utf8')) : {};
  const course = new Map(courseKanji(P.dataFile).map((it) => [it.c, it]));
  const { primary, problems } = L.applyOverrides(
    Object.fromEntries(Object.entries(derived).map(([k, v]) => [k, v.primary])), overrides, (k) => course.get(k));
  for (const p of problems) log('override skipped: ' + p);
  fs.writeFileSync(P.appFile, '// Generated by scripts/primary-readings.js --apply — edit scripts/primary-readings/overrides.json instead\n' +
    'window.SRS_PRIMARY = ' + JSON.stringify(primary) + ';\n');
  const n = Object.keys(primary).length;
  log(`wrote ${path.relative(ROOT, P.appFile)}: ${n} kanji, ${Object.values(primary).filter((p) => p.length === 2).length} with two readings`);
  return { primary, problems };
}

module.exports = { derive, apply, loadKanjidic };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ti = args.indexOf('--threshold');
  const threshold = ti >= 0 ? parseFloat(args[ti + 1]) : L.DEFAULT_THRESHOLD;
  if (args.includes('--apply')) apply(); else derive({ threshold });
}
