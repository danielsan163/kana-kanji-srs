// Checks for merging progress from two devices: node test/sync.test.js
global.window = { api: { saveProgress() {}, saveProgressSync() {}, loadProgress: async () => null } };
require('../app/data/data.js');
require('../app/js/kana.js');
require('../app/js/srs.js');
const S = window.SRS;
let fail = 0;
function t(name, ok) {
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name);
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));

const base = S.migrate(S.newState());
base.items['kana:あ'] = { s: 2, u: 1, l: 2, a: 100, c: 1, w: 0, t: 1000 };
base.items['kana:い'] = { s: 1, u: 1, l: 2, a: 100, c: 0, w: 0, t: 1000 };
base.items['kana:う'] = { s: 3, u: 1, l: 2, a: 100, c: 2, w: 0 }; // from before sync: no t

const pc = clone(base), phone = clone(base);
// PC reviews あ later than the phone does; phone reviews い later
pc.items['kana:あ'] = { ...pc.items['kana:あ'], s: 3, c: 2, t: 3000 };
phone.items['kana:あ'] = { ...phone.items['kana:あ'], s: 1, w: 1, t: 2000 };
phone.items['kana:い'] = { ...phone.items['kana:い'], s: 2, c: 1, t: 4000 };
// legacy item: phone has more reviews
phone.items['kana:う'] = { ...phone.items['kana:う'], s: 4, c: 3 };
// only on the phone
phone.items['kana:え'] = { s: 1, u: 5, l: 5, a: 200, c: 0, w: 0, t: 5000 };

// notes: phone edits one later, PC deletes another later, each adds one of its own
pc.notes['kana:あ'] = 'pc note'; pc.mt['n:kana:あ'] = 1000;
phone.notes['kana:あ'] = 'phone note'; phone.mt['n:kana:あ'] = 2000;
phone.notes['kana:い'] = 'old note'; phone.mt['n:kana:い'] = 1000;
pc.mt['n:kana:い'] = 3000; // deleted on PC afterwards
pc.notes['kana:う'] = 'only pc';
phone.synonyms['k:日'] = ['sun day']; phone.mt['y:k:日'] = 1500;

// settings: phone changed a shared one later; device-only ones stay per device
pc.settings.batchSize = 7; pc.mt.settings = 1000; pc.settings.theme = 'light';
phone.settings.batchSize = 10; phone.mt.settings = 2000; phone.settings.theme = 'dark';

// daily counts from two devices on the same day
pc.dayLog = { pc: { '2026-10-12': { reviews: 30, correct: 25, lessons: 5 } } };
phone.dayLog = { pc: { '2026-10-12': { reviews: 20, correct: 18, lessons: 5 } }, phone: { '2026-10-12': { reviews: 12, correct: 10, lessons: 0 } } };
pc.levelLog = { 1: 500, 2: 900 }; pc.level = 2;
phone.levelLog = { 1: 400 }; phone.level = 1;

const m = S.merge(pc, phone);
t('newer item wins (PC)', m.items['kana:あ'].s === 3);
t('newer item wins (phone)', m.items['kana:い'].s === 2);
t('pre-sync item: more reviews wins', m.items['kana:う'].s === 4);
t('item only on one side is kept', !!m.items['kana:え']);
t('newer note edit wins', m.notes['kana:あ'] === 'phone note');
t('newer note deletion wins', !('kana:い' in m.notes));
t('note only on one side is kept', m.notes['kana:う'] === 'only pc');
t('synonyms only on one side are kept', stable(m.synonyms['k:日']) === stable(['sun day']));
t('newer shared setting wins', m.settings.batchSize === 10);
t('device setting stays local', m.settings.theme === 'light');
t('per-device day counts take the larger', m.dayLog.pc['2026-10-12'].reviews === 30);
t('day totals add devices together', m.days['2026-10-12'].reviews === 42 && m.days['2026-10-12'].correct === 35);
t('level log keeps the earliest time', m.levelLog[1] === 400 && m.levelLog[2] === 900);
t('level is the higher one', m.level === 2);
t('merge is symmetric for items', stable(S.merge(phone, pc).items) === stable(m.items));
t('merging again changes nothing', stable(S.merge(m, phone)) === stable(m) && stable(S.merge(m, m)) === stable(m));
t('inputs are not modified', pc.items['kana:あ'].s === 3 && phone.items['kana:あ'].s === 1);

const reset = S.migrate(S.newState());
reset.settings.theme = 'dark';
const a = S.adopt(pc, reset);
t('adopt takes the other save', Object.keys(a.items).length === 0);
t('adopt keeps this device\'s own settings', a.settings.theme === 'light');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all passed');
