// Checks for primary-reading derivation and grading: node test/primary-readings.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../scripts/primary-readings-lib');
const script = require('../scripts/primary-readings');

let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : `→ ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// Readings as KANJIDIC2 lists them (the same ones the app shows)
const KD = {
  大: { on: ['ダイ', 'タイ'], kun: ['おお', 'おお.きい', 'おお.いに'] },
  食: { on: ['ショク', 'ジキ'], kun: ['く.う', 'く.らう', 'た.べる', 'は.む'] },
  物: { on: ['ブツ', 'モツ'], kun: ['もの', 'もの-'] },
  受: { on: ['ジュ'], kun: ['う.ける', '-う.け', 'う.かる'] },
  付: { on: ['フ'], kun: ['つ.ける', '-つ.け', 'つ.く', '-づ.け', '-つけ'] },
  話: { on: ['ワ'], kun: ['はな.す', 'はなし'] },
  生: { on: ['セイ', 'ショウ'], kun: ['い.きる', 'う.まれる', 'うま.れる', 'なま'] },
  行: { on: ['コウ', 'ギョウ', 'アン'], kun: ['い.く', 'ゆ.く', 'おこな.う', 'おこ.なう'] },
  人: { on: ['ジン', 'ニン'], kun: ['ひと', 'り', 'と'] },
  学: { on: ['ガク'], kun: ['まな.ぶ'] },
  校: { on: ['コウ', 'キョウ'], kun: [] },
  今: { on: ['コン', 'キン'], kun: ['いま'] },
  日: { on: ['ニチ', 'ジツ'], kun: ['ひ', '-び', '-か'] },
  先: { on: ['セン'], kun: ['さき'] },
  気: { on: ['キ', 'ケ'], kun: ['いき', 'き'] }, // KANJIDIC lists き as both
  天: { on: ['テン'], kun: ['あまつ', 'あめ', 'あま-'] },
};
const cands = new Map(Object.entries(KD).map(([k, v]) => [k, L.candidates(v.on, v.kun)]));
const inWord = (k, w, r) => L.readingInWord(k, w, r, cands);

// ------------------------------------------------------------------ okurigana
eq('大きい counts toward おお, not おおき', inWord('大', '大きい', 'おおきい'), 'kun:おお');
eq('大いに counts toward おお', inWord('大', '大いに', 'おおいに'), 'kun:おお');
eq('食べる → た', inWord('食', '食べる', 'たべる'), 'kun:た');
eq('食べ物 → た (okurigana inside a compound)', inWord('食', '食べ物', 'たべもの'), 'kun:た');
eq('食う → く', inWord('食', '食う', 'くう'), 'kun:く');
eq('受付 → う (unwritten okurigana け)', inWord('受', '受付', 'うけつけ'), 'kun:う');
eq('話 alone → はなし, its own KANJIDIC reading', inWord('話', '話', 'はなし'), 'kun:はなし');
eq('話す → はな', inWord('話', '話す', 'はなす'), 'kun:はな');
eq('生まれる → う, not うま', inWord('生', '生まれる', 'うまれる'), 'kun:う');
eq('行う → おこな, not おこ', inWord('行', '行う', 'おこなう'), 'kun:おこな');
eq('katakana in JMdict readings', inWord('大', '大きい', 'オオキイ'), 'kun:おお');

// ------------------------------------------------------------------ sound changes and unalignable words
eq('学校: small っ (がく → がっ)', inWord('学', '学校', 'がっこう'), 'on:がく');
eq('人々: rendaku on 々 (ひと → びと)', inWord('人', '人々', 'ひとびと'), 'kun:ひと');
eq('先生: on\'yomi', inWord('生', '先生', 'せんせい'), 'on:せい');
eq('kanji missing from KANJIDIC → skipped', inWord('生', '生涯', 'しょうがい'), null);
eq('same sound as on and kun → counts as on (天気)', inWord('気', '天気', 'てんき'), 'on:き');
eq('same sound with okurigana → on (死ぬ)', L.readingInWord('死', '死ぬ', 'しぬ', new Map([['死', L.candidates(['シ'], ['し.ぬ', 'し.に-'])]])), 'on:し');
eq('今日 (jukujikun) is skipped', inWord('今', '今日', 'きょう'), null);
eq('no rendaku on the first kanji', inWord('人', '人', 'びと'), null);

// ------------------------------------------------------------------ two-reading threshold
const counts = (o) => new Map(Object.entries(o));
eq('clear winner → one reading', L.pickPrimary(counts({ 'on:せい': 100, 'kun:なま': 60 }), 0.25), ['on:せい']);
eq('runner-up within 25% → two', L.pickPrimary(counts({ 'on:せい': 100, 'kun:い': 80 }), 0.25), ['on:せい', 'kun:い']);
eq('exactly at the threshold → two', L.pickPrimary(counts({ 'on:せい': 100, 'kun:い': 75 }), 0.25), ['on:せい', 'kun:い']);
eq('just outside → one', L.pickPrimary(counts({ 'on:せい': 100, 'kun:い': 74 }), 0.25), ['on:せい']);
eq('threshold is adjustable', L.pickPrimary(counts({ 'on:せい': 100, 'kun:い': 74 }), 0.3), ['on:せい', 'kun:い']);
eq('never more than two', L.pickPrimary(counts({ 'on:a': 100, 'on:b': 99, 'kun:c': 98 }), 0.25).length, 2);
eq('order follows weight', L.pickPrimary(counts({ 'kun:い': 90, 'on:せい': 100 }), 0.25), ['on:せい', 'kun:い']);
eq('no words → nothing (fallback handles it)', L.pickPrimary(new Map(), 0.25), []);
eq('fallback: first on\'yomi', L.fallbackPrimary(['セイ', 'ショウ'], ['なま']), [{ reading: 'セイ', type: 'on' }]);
eq('fallback: kun stem when no on\'yomi', L.fallbackPrimary([], ['た.べる']), [{ reading: 'た', type: 'kun' }]);
eq('entry: on in katakana', L.keyToEntry('on:せい'), { reading: 'セイ', type: 'on' });

// Weighted tally: frequency decides, not the number of words
const words = [
  { written: '大きい', reading: 'おおきい', weight: 50 },
  { written: '大学', reading: 'だいがく', weight: 30 },
  { written: '大事', reading: 'だいじ', weight: 5 },
  { written: '大人', reading: 'おとな', weight: 40 }, // jukujikun: skipped
];
const t = L.tally(['大'], words, cands).get('大');
eq('tally: weights per reading', Object.fromEntries(t.counts), { 'kun:おお': 50, 'on:だい': 30 });
eq('tally: unaligned words counted', t.unaligned, 2); // 大人, and 大事 (事 isn't in the test dictionary)
eq('tally: examples kept', t.examples.get('kun:おお')[0].written, '大きい');

// ------------------------------------------------------------------ overrides
const known = (k) => KD[k];
const derived = { 生: [{ reading: 'セイ', type: 'on' }], 大: [{ reading: 'ダイ', type: 'on' }] };
let r = L.applyOverrides(derived, { _comment: 'x', 生: [{ reading: 'せい', type: 'on' }, { reading: 'い.きる', type: 'kun' }] }, known);
eq('override replaces derived (normalized)', r.primary.生, [{ reading: 'セイ', type: 'on' }, { reading: 'い', type: 'kun' }]);
eq('other kanji untouched', r.primary.大, derived.大);
r = L.applyOverrides(derived, { 大: [{ reading: 'ゾウ', type: 'on' }] }, known);
eq('unknown reading rejected', [r.primary.大, r.problems.length], [derived.大, 1]);
r = L.applyOverrides(derived, { 大: [{ reading: 'ダイ', type: 'on' }, { reading: 'タイ', type: 'on' }, { reading: 'おお', type: 'kun' }] }, known);
eq('more than two rejected', r.problems.length, 1);

// Full run in a temp folder: overrides survive re-running the derivation and the apply step
(function persistence() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kks-primary-'));
  const raw = path.join(tmp, 'raw'), dir = path.join(tmp, 'out');
  fs.mkdirSync(raw); fs.mkdirSync(dir);
  const kd = Object.entries(KD).map(([c, v]) => `<character><literal>${c}</literal><reading_meaning><rmgroup>` +
    v.on.map((x) => `<reading r_type="ja_on">${x}</reading>`).join('') + v.kun.map((x) => `<reading r_type="ja_kun">${x}</reading>`).join('') +
    '</rmgroup></reading_meaning></character>').join('\n');
  fs.writeFileSync(path.join(raw, 'kanjidic2.xml'), `<kanjidic2>\n${kd}\n</kanjidic2>`);
  const jw = (k, r) => ({ kanji: [{ text: k, common: true, tags: [] }], kana: [{ text: r, common: true, tags: [], appliesToKanji: ['*'] }] });
  fs.writeFileSync(path.join(raw, 'jmdict-eng-common-test.json'), JSON.stringify({ words: [
    jw('先生', 'せんせい'), jw('学生', 'がくせい'), jw('生きる', 'いきる'), jw('生まれる', 'うまれる'), jw('大きい', 'おおきい'), jw('大学', 'だいがく'),
  ] }));
  fs.writeFileSync(path.join(raw, 'ja-wordfreq.tsv'), '先生\t100\n学生\t60\n生きる\t70\n生まれる\t40\n大きい\t90\n大学\t50\n');
  const item = (c) => ({ id: 'k:' + c, t: 'kanji', c, on: KD[c].on, kun: KD[c].kun.map((k) => k.replace(/-/g, '')) });
  const dataFile = path.join(tmp, 'data.js');
  fs.writeFileSync(dataFile, 'window.SRS_DATA = ' + JSON.stringify({ levels: [], items: [item('生'), item('大')] }) + ';\n');
  const P = { raw, dir, dataFile, appFile: path.join(tmp, 'primary-readings.js'), log: () => {} };
  const readApp = () => { const s = fs.readFileSync(P.appFile, 'utf8'); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };

  const d = script.derive({ ...P, threshold: 0.25 });
  eq('pipeline: 生 → セイ (160) vs い (70)', d.kanji.生.primary, [{ reading: 'セイ', type: 'on' }]);
  eq('pipeline: 大 → おお (90) and ダイ (50)? 50 < 67.5 so one', d.kanji.大.primary, [{ reading: 'おお', type: 'kun' }]);
  eq('pipeline: report counts', [d.doubles, d.total], [0, 2]);

  const ov = JSON.stringify({ 生: [{ reading: 'セイ', type: 'on' }, { reading: 'い', type: 'kun' }] }, null, 2);
  fs.writeFileSync(path.join(dir, 'overrides.json'), ov);
  script.apply(P);
  eq('apply: override used', readApp().生, [{ reading: 'セイ', type: 'on' }, { reading: 'い', type: 'kun' }]);
  script.derive({ ...P, threshold: 0.1 });
  eq('re-run: overrides.json untouched', fs.readFileSync(path.join(dir, 'overrides.json'), 'utf8'), ov);
  script.apply(P);
  eq('re-run: override still wins', readApp().生, [{ reading: 'セイ', type: 'on' }, { reading: 'い', type: 'kun' }]);
  eq('re-run: derived kanji still there', readApp().大, [{ reading: 'おお', type: 'kun' }]);
  fs.rmSync(tmp, { recursive: true, force: true });
})();

// ------------------------------------------------------------------ grading with primary readings
// The real app/data/primary-readings.js, with a few kanji replaced by fixed test cases
const appPrimary = (() => { const s = fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'primary-readings.js'), 'utf8'); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); })();
global.window = {
  api: { saveProgress() {}, saveProgressSync() {}, loadProgress: async () => null },
  SRS_PRIMARY: {
    ...appPrimary,
    生: [{ reading: 'セイ', type: 'on' }, { reading: 'い', type: 'kun' }],
    行: [{ reading: 'コウ', type: 'on' }, { reading: 'ギョウ', type: 'on' }],
    大: [{ reading: 'おお', type: 'kun' }],
    食: undefined,
  },
};
require('../app/data/data.js');
require('../app/js/kana.js');
require('../app/js/srs.js');
const S = window.SRS;
const g = (c, prompt, ans, opts) => S.grade(S.byId.get('k:' + c), prompt, ans, opts).result;
(async () => {
  await S.init();
  eq('prompts: on + kun primaries', S.promptsFor(S.byId.get('k:生')), ['meaning', 'on', 'kun']);
  eq('prompts: kun only', S.promptsFor(S.byId.get('k:大')), ['meaning', 'kun']);
  eq('prompts: two on\'yomi', S.promptsFor(S.byId.get('k:行')), ['meaning', 'on', 'on2']);
  eq('prompts: no primary → old behaviour', S.promptsFor(S.byId.get('k:食')), ['meaning', 'on', 'kun']);
  eq('primary on correct', g('生', 'on', 'セイ'), 'correct');
  eq('non-primary on → retry', g('生', 'on', 'ショウ'), 'retry');
  eq('primary kun with okurigana', g('生', 'kun', 'いきる'), 'correct');
  eq('primary kun stem', g('生', 'kun', 'い'), 'correct');
  eq('non-primary kun → retry', g('生', 'kun', 'なま'), 'retry');
  eq('other type → retry', g('生', 'on', 'いきる'), 'retry');
  eq('nonsense → wrong', g('生', 'on', 'カ'), 'wrong');
  eq('大: ダイ is not asked for', g('大', 'kun', 'だい'), 'retry');
  eq('大: おおきい accepted', g('大', 'kun', 'おおきい'), 'correct');
  eq('行: either order', [g('行', 'on', 'ギョウ'), g('行', 'on2', 'コウ')], ['correct', 'correct']);
  eq('行: repeating the first → retry', g('行', 'on2', 'コウ', { used: ['コウ'] }), 'retry');
  eq('行: the other one after it', g('行', 'on2', 'ギョウ', { used: ['コウ'] }), 'correct');
  eq('correct answer names its primary', S.grade(S.byId.get('k:行'), 'on', 'こう').primary, 'コウ');
  eq('display: kun primary shows its full form', S.primaryDisplay(S.byId.get('k:生'), { reading: 'い', type: 'kun' }), 'い.きる');
  // Every applied primary reading must be accepted on its own prompt
  const bad = [];
  for (const it of S.items) {
    if (it.t !== 'kanji' || !it.primary_readings) continue;
    const prompts = S.promptsFor(it).slice(1);
    it.primary_readings.forEach((p, i) => {
      const used = it.primary_readings.slice(0, i).map((x) => x.reading);
      if (S.grade(it, prompts[i], p.reading, { used }).result !== 'correct') bad.push(it.c + p.reading);
    });
  }
  eq('app data: every primary reading is accepted', bad, []);
  console.log(fail ? `${fail} FAILED` : 'all passed');
  if (fail) process.exitCode = 1;
})();
