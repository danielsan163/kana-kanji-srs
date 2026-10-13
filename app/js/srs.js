// SRS engine: content index, progress state, unlocking, scheduling and answer grading
(function () {
  const { levels, items } = window.SRS_DATA;
  const { normKana, kataToHira, toKana, isJapanese } = window.Kana;

  // ------------------------------------------------------------------ content index
  const byId = new Map(items.map((it, i) => [it.id, Object.assign(it, { idx: i })]));
  const byLevel = new Map(levels.map((l) => [l.n, []]));
  for (const it of items) byLevel.get(it.lvl).push(it);
  const vocabByKanji = new Map();
  const sentencesByKanji = new Map();
  for (const it of items) {
    if (it.t === 'vocab' || it.t === 'sentence') {
      const map = it.t === 'vocab' ? vocabByKanji : sentencesByKanji;
      for (const k of it.kanji) { if (!map.has(k)) map.set(k, []); map.get(k).push(it); }
    }
  }
  const TYPE_ORDER = { kana: 0, kanji: 1, vocab: 2, sentence: 3 };
  const MAX_LEVEL = levels.length;

  // ------------------------------------------------------------------ SRS stages
  // 0 = lesson available, 1–4 Apprentice, 5–6 Guru, 7 Master, 8 Enlightened, 9 Burned
  const STAGE_NAMES = ['Lesson', 'Apprentice I', 'Apprentice II', 'Apprentice III', 'Apprentice IV', 'Guru I', 'Guru II', 'Master', 'Enlightened', 'Burned'];
  const INTERVAL_HOURS = [0, 4, 8, 23, 47, 167, 335, 730, 2927];
  const GURU = 5;
  const BURNED = 9;
  const LEVEL_UP_RATIO = 0.9;
  const HOUR = 3600e3;
  const stageGroup = (s) => (s <= 0 ? 'lesson' : s <= 4 ? 'apprentice' : s <= 6 ? 'guru' : s === 7 ? 'master' : s === 8 ? 'enlightened' : 'burned');

  function nextAvailable(stage, now) {
    if (stage >= BURNED) return null;
    // Align to the top of the hour like WaniKani so reviews arrive in batches
    return Math.floor((now + INTERVAL_HOURS[stage] * HOUR) / HOUR) * HOUR;
  }

  // ------------------------------------------------------------------ state
  // Settings that belong to one device and never sync (the phone can use a different theme or voice)
  const DEVICE_SETTINGS = ['theme', 'jpFont', 'voice', 'notifications', 'closeToTray', 'openAtLogin'];
  // Each device keeps its own daily counts (dayLog) so totals add up correctly after syncing
  const deviceId = (() => {
    try {
      let id = localStorage.getItem('kks-device');
      if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('kks-device', id); }
      return id;
    } catch { return 'local'; }
  })();

  function newState() {
    const now = Date.now();
    return {
      version: 2,
      createdAt: now,
      epoch: now,    // changes on reset/import; synced devices adopt the newest epoch instead of merging
      level: 1,
      settings: {
        batchSize: 5, theme: 'dark', jpFont: 'print', autoplayAudio: true, exampleFurigana: true, voice: '', maxLessonsPerDay: 0,
        reviewOrder: 'random', backToBack: false, notifications: true, closeToTray: true, openAtLogin: false,
      },
      // id -> { s: stage, u: unlockedAt, l: learnedAt, a: availableAt, b: burnedAt, c: correct, w: wrong,
      //        k: correct streak, lw: last wrong, mk: marked known, t: last changed (for sync) }
      items: {},
      notes: {},     // id -> string
      synonyms: {},  // id -> [string]
      days: {},      // 'YYYY-MM-DD' -> { reviews, correct, lessons }: all devices added up (rebuilt from dayLog)
      dayLog: {},    // device -> 'YYYY-MM-DD' -> { reviews, correct, lessons }
      mt: {},        // last-changed times for synced things that aren't items: 'n:<id>' notes, 'y:<id>' synonyms, settings, vacation
      levelLog: { 1: now },
      levelForced: {}, // level -> true when it was unlocked early with "Unlock level N now"
      vacation: null,  // { since } while vacation mode is on
    };
  }
  let state = null;

  function migrate(s) {
    const base = newState();
    s.settings = Object.assign(base.settings, s.settings || {});
    for (const k of ['items', 'notes', 'synonyms', 'days', 'levelLog', 'levelForced', 'mt']) s[k] = s[k] || base[k];
    if (s.vacation === undefined) s.vacation = null;
    s.level = Math.min(Math.max(1, s.level || 1), MAX_LEVEL);
    s.epoch = s.epoch || s.createdAt || Date.now();
    // Before sync, daily counts were one shared table: they become this device's log
    if (!s.dayLog) s.dayLog = { [deviceId]: JSON.parse(JSON.stringify(s.days)) };
    s.days = sumDays(s.dayLog);
    s.version = 2;
    return s;
  }
  function sumDays(dayLog) {
    const out = {};
    for (const log of Object.values(dayLog)) for (const [d, v] of Object.entries(log)) {
      const o = out[d] || (out[d] = { reviews: 0, correct: 0, lessons: 0 });
      o.reviews += v.reviews || 0; o.correct += v.correct || 0; o.lessons += v.lessons || 0;
    }
    return out;
  }

  let saveTimer = null;
  let changeListener = null;
  let quiet = false; // true while applying synced data, so it doesn't count as a new local change
  function save(immediate) {
    clearTimeout(saveTimer);
    if (changeListener && !quiet) changeListener();
    if (immediate) return window.api.saveProgress(state);
    saveTimer = setTimeout(() => window.api.saveProgress(state), 400);
  }
  function flush() { clearTimeout(saveTimer); window.api.saveProgressSync(state); }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /** Today's totals across all synced devices (read-only; use bumpDay to count something). */
  function dayStats() {
    return state.days[today()] || { reviews: 0, correct: 0, lessons: 0 };
  }
  function bumpDay(field) {
    const k = today();
    const mine = (state.dayLog[deviceId] = state.dayLog[deviceId] || {});
    for (const o of [mine[k] || (mine[k] = { reviews: 0, correct: 0, lessons: 0 }), state.days[k] || (state.days[k] = { reviews: 0, correct: 0, lessons: 0 })]) o[field]++;
  }
  const touch = (key) => { state.mt[key] = Date.now(); };
  function setNote(id, text) {
    if (text.trim()) state.notes[id] = text; else delete state.notes[id];
    touch('n:' + id);
    save();
  }
  function setSynonyms(id, list) {
    if (list.length) state.synonyms[id] = list; else delete state.synonyms[id];
    touch('y:' + id);
    save();
  }
  function setSetting(key, value) {
    state.settings[key] = value;
    if (!DEVICE_SETTINGS.includes(key)) touch('settings');
    save();
  }

  const prog = (id) => state.items[id];
  const stageOf = (id) => (state.items[id] ? state.items[id].s : -1);

  // ------------------------------------------------------------------ unlocking
  function prerequisitesMet(it) {
    if (it.t === 'vocab' || it.t === 'sentence') return it.kanji.every((k) => stageOf('k:' + k) >= GURU);
    return true;
  }
  const gatingItems = (lvl) => byLevel.get(lvl).filter((it) => it.t === 'kana' || it.t === 'kanji');

  function levelProgress(lvl) {
    const g = gatingItems(lvl);
    const guru = g.filter((it) => stageOf(it.id) >= GURU).length;
    const needed = Math.ceil(g.length * LEVEL_UP_RATIO);
    return { total: g.length, guru, needed, done: guru >= needed };
  }

  /** Unlock new items and level up where earned. Returns newly unlocked items. */
  function refreshUnlocks() {
    const now = Date.now();
    while (state.level < MAX_LEVEL && levelProgress(state.level).done) {
      state.level++;
      state.levelLog[state.level] = state.levelLog[state.level] || now;
    }
    const unlocked = [];
    for (let l = 1; l <= state.level; l++) {
      for (const it of byLevel.get(l)) {
        if (state.items[it.id] || !prerequisitesMet(it)) continue;
        state.items[it.id] = { s: 0, u: now, c: 0, w: 0, t: now };
        unlocked.push(it);
      }
    }
    if (unlocked.length) save();
    return unlocked;
  }

  function forceNextLevel() {
    if (state.level >= MAX_LEVEL) return;
    state.level++;
    state.levelLog[state.level] = state.levelLog[state.level] || Date.now();
    state.levelForced[state.level] = true;
    refreshUnlocks();
    save(true);
  }

  // ------------------------------------------------------------------ level-up estimate
  /**
   * Earliest time the current level can be passed if every review from now on is correct:
   * project each gating item's Guru time from its stage and next review, then take the one
   * at the 90% threshold position. Returns null when the level is already passable or on vacation.
   */
  function levelUpEstimate(now = Date.now()) {
    if (state.vacation) return null;
    const lp = levelProgress(state.level);
    if (lp.done) return null;
    const times = [];
    for (const it of gatingItems(state.level)) {
      const p = state.items[it.id];
      if (p && p.s >= GURU) continue;
      let stage, t;
      if (!p || p.s === 0) { stage = 1; t = nextAvailable(1, now); } // lesson done now
      else { stage = p.s; t = Math.max(p.a, now); }
      while (stage < 4) { stage++; t = nextAvailable(stage, t); }
      times.push(t);
    }
    times.sort((a, b) => a - b);
    const idx = lp.needed - lp.guru - 1;
    return idx >= 0 && idx < times.length ? times[idx] : null;
  }

  // ------------------------------------------------------------------ mark known / vacation
  /** Skip an item you already know straight to Guru I (first check-up review in a week). */
  function markKnown(id) {
    const now = Date.now();
    const p = state.items[id];
    if (!p || p.s >= GURU) return [];
    p.s = GURU;
    p.l = p.l || now;
    p.a = nextAvailable(GURU, now);
    p.mk = now;
    p.t = now;
    const unlocked = refreshUnlocks();
    save(true);
    return unlocked;
  }
  function startVacation() {
    if (state.vacation) return;
    state.vacation = { since: Date.now() };
    touch('vacation');
    save(true);
  }
  /** Shift every pending review by the time spent away, so nothing piles up. */
  function endVacation() {
    if (!state.vacation) return;
    const now = Date.now();
    const away = now - state.vacation.since;
    for (const p of Object.values(state.items)) {
      if (p.s >= 1 && p.s < BURNED && p.a > state.vacation.since) { p.a += away; p.t = now; }
    }
    state.vacation = null;
    touch('vacation');
    save(true);
  }

  // ------------------------------------------------------------------ queues
  function lessonQueue() {
    if (state.vacation) return [];
    return items
      .filter((it) => stageOf(it.id) === 0)
      .sort((a, b) => (a.lvl - b.lvl) || (TYPE_ORDER[a.t] - TYPE_ORDER[b.t]) || (a.idx - b.idx));
  }
  function lessonsLeftToday() {
    const max = state.settings.maxLessonsPerDay;
    return max > 0 ? Math.max(0, max - dayStats().lessons) : Infinity;
  }
  function reviewQueue(now = Date.now()) {
    const out = [];
    if (state.vacation) return out;
    for (const [id, p] of Object.entries(state.items)) {
      if (p.s >= 1 && p.s < BURNED && p.a <= now && byId.has(id)) out.push(byId.get(id));
    }
    return out;
  }
  function forecast(hours = 24) {
    const now = Date.now();
    if (state.vacation) return { start: Math.floor(now / HOUR) * HOUR, buckets: new Array(hours).fill(0) };
    const start = Math.floor(now / HOUR) * HOUR;
    const buckets = new Array(hours).fill(0);
    for (const [id, p] of Object.entries(state.items)) {
      if (p.s < 1 || p.s >= BURNED || p.a <= now || !byId.has(id)) continue;
      const h = Math.floor((p.a - start) / HOUR);
      if (h >= 0 && h < hours) buckets[h]++;
    }
    return { start, buckets };
  }
  function nextReviewAt() {
    if (state.vacation) return null;
    let min = Infinity;
    for (const p of Object.values(state.items)) if (p.s >= 1 && p.s < BURNED && p.a < min) min = p.a;
    return min === Infinity ? null : min;
  }
  function stageCounts() {
    const c = { lesson: 0, apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0 };
    for (const [id, p] of Object.entries(state.items)) if (byId.has(id)) c[stageGroup(p.s)]++;
    return c;
  }

  // ------------------------------------------------------------------ SRS updates
  function completeLesson(it) {
    const now = Date.now();
    const p = state.items[it.id] || (state.items[it.id] = { s: 0, u: now, c: 0, w: 0 });
    p.s = 1; p.l = now; p.a = nextAvailable(1, now); p.t = now;
    bumpDay('lessons');
    save();
  }
  /** Apply a finished review. wrongCount = total wrong answers this session for the item. */
  function completeReview(it, wrongCount) {
    const now = Date.now();
    const p = state.items[it.id];
    const before = p.s;
    if (wrongCount === 0) {
      p.s = Math.min(BURNED, p.s + 1);
      p.c++;
      p.k = (p.k || 0) + 1;
    } else {
      const penalty = Math.ceil(wrongCount / 2) * (p.s >= GURU ? 2 : 1);
      p.s = Math.max(1, p.s - penalty);
      p.w++;
      p.k = 0;
      p.lw = now;
    }
    p.a = nextAvailable(p.s, now);
    p.t = now;
    if (p.s === BURNED) p.b = now;
    bumpDay('reviews');
    if (wrongCount === 0) bumpDay('correct');
    const unlocked = refreshUnlocks();
    save();
    return { before, after: p.s, unlocked };
  }
  // ------------------------------------------------------------------ extra study & leeches (no SRS effect)
  const started = (p) => p && p.s >= 1;
  function practiceSets(now = Date.now()) {
    const recentLessons = [], recentMistakes = [], currentLevel = [];
    for (const [id, p] of Object.entries(state.items)) {
      const it = byId.get(id);
      if (!it || !started(p)) continue;
      if (p.l && now - p.l < 48 * HOUR) recentLessons.push(it);
      if (p.lw && now - p.lw < 24 * HOUR) recentMistakes.push(it);
      if (it.lvl === state.level) currentLevel.push(it);
    }
    return { recentLessons, recentMistakes, currentLevel, leeches: leeches().map((l) => l.it) };
  }
  // Leech score: wrong answers weighed against the current correct streak.
  // Items you keep missing and haven't recovered from score highest.
  function leechScore(p) { return p.w / Math.pow((p.k || 0) + 1, 1.5); }
  function leeches({ minWrong = 2, minScore = 1 } = {}) {
    const out = [];
    for (const [id, p] of Object.entries(state.items)) {
      const it = byId.get(id);
      if (!it || !started(p) || p.s >= BURNED || p.w < minWrong) continue;
      const score = leechScore(p);
      if (score >= minScore) out.push({ it, p, score });
    }
    return out.sort((a, b) => b.score - a.score || b.p.w - a.p.w);
  }

  function resetItem(id) {
    const p = state.items[id];
    if (!p) return;
    p.s = 0; delete p.a; delete p.l; delete p.b;
    p.t = Date.now();
    save(true);
  }

  // ------------------------------------------------------------------ prompts
  const hasOn = (it) => it.t === 'kanji' && it.on.length > 0;
  const hasKun = (it) => it.t === 'kanji' && it.kun.length > 0;
  function promptsFor(it) {
    switch (it.t) {
      case 'kana': return ['reading'];
      case 'kanji': return ['meaning', ...(hasOn(it) ? ['on'] : []), ...(hasKun(it) ? ['kun'] : [])];
      case 'vocab': return it.kanji.length ? ['meaning', 'reading'] : ['meaning']; // kana-only words show their reading
      case 'sentence': return ['reading', 'translate'];
      default: return [];
    }
  }

  // ------------------------------------------------------------------ grading
  function normMeaning(s) {
    return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function meaningVariants(m) {
    const out = new Set();
    const add = (x) => {
      const n = normMeaning(x);
      if (!n) return;
      out.add(n);
      const stripped = n.replace(/^(to|a|an|the) /, '');
      if (stripped) out.add(stripped);
    };
    add(m);
    add(m.replace(/\([^)]*\)|\[[^\]]*\]/g, ''));   // without parentheticals
    add(m.replace(/[()[\]]/g, ''));                 // parentheticals kept as words
    return out;
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }
  const tolerance = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : Math.floor(len / 4));

  function acceptedMeanings(it) {
    return [...(it.meanings || []), ...(it.alt || []), ...(state.synonyms[it.id] || [])];
  }
  // Kun'yomi "た.べる" is accepted as た or たべる
  function kunForms(k) {
    const [stem, oku] = k.split('.');
    return oku ? [stem, stem + oku] : [stem];
  }

  /**
   * Grade an answer. Returns { result: 'correct'|'wrong'|'retry', close?, message? }
   * 'retry' = shake and let the user try again without penalty.
   */
  function grade(it, prompt, raw) {
    const answer = raw.trim();
    if (!answer) return { result: 'retry', message: '' };

    if (prompt === 'meaning') {
      if (isJapanese(answer)) return { result: 'retry', message: 'We want the English meaning, not the reading.' };
      const a = normMeaning(answer);
      const aStripped = a.replace(/^(to|a|an|the) /, '');
      let best = Infinity;
      for (const m of acceptedMeanings(it)) {
        for (const v of meaningVariants(m)) {
          if (v === a || v === aStripped) return { result: 'correct' };
          const d = Math.min(levenshtein(v, a), levenshtein(v, aStripped));
          if (d <= tolerance(v.length) && d < best) best = d;
        }
      }
      if (best < Infinity) return { result: 'correct', close: true, message: 'Close enough, but check the spelling.' };
      // typed the reading in romaji?
      const asKana = normKana(toKana(answer, { final: true }));
      if (/^[぀-ゟー]+$/.test(asKana) && readingsOf(it).some((r) => normKana(r) === asKana)) {
        return { result: 'retry', message: 'That looks like the reading. We want the meaning.' };
      }
      return { result: 'wrong' };
    }

    if (it.t === 'kana') {
      const a = answer.toLowerCase().replace(/\s+/g, '');
      if (it.romaji.includes(a)) return { result: 'correct' };
      const conv = toKana(a, { final: true });
      if (normKana(conv) === normKana(it.c)) return { result: 'correct' };
      if (isJapanese(a) && normKana(a) === normKana(it.c)) return { result: 'correct' };
      return { result: 'wrong' };
    }

    const a = normKana(toKana(answer, { final: true }));
    if (!/^[぀-ゟ]+$/.test(a)) return { result: 'retry', message: 'Answer in kana (type romaji and it converts).' };

    if (prompt === 'on' || prompt === 'kun') {
      const on = it.on.map((r) => normKana(r));
      const kun = it.kun.flatMap(kunForms).map((r) => normKana(r));
      const want = prompt === 'on' ? on : kun;
      const other = prompt === 'on' ? kun : on;
      if (want.includes(a)) return { result: 'correct' };
      if (other.includes(a)) {
        return { result: 'retry', message: prompt === 'on' ? "That's a kun'yomi. We want the on'yomi." : "That's an on'yomi. We want the kun'yomi." };
      }
      return { result: 'wrong' };
    }

    if (it.t === 'vocab') {
      if (it.r.some((r) => normKana(r) === a)) return { result: 'correct' };
      // typed an on/kun reading of a single kanji instead?
      return { result: 'wrong' };
    }

    if (it.t === 'sentence') {
      if (sentenceReadingRegex(it).test(a)) return { result: 'correct' };
      return { result: 'wrong' };
    }
    return { result: 'wrong' };
  }

  const PARTICLE_ALT = { 'は': 'は|わ', 'へ': 'へ|え', 'を': 'を|お' };
  const reCache = new Map();
  function sentenceReadingRegex(it) {
    if (reCache.has(it.id)) return reCache.get(it.id);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let src = '';
    // token: [surface, reading, isParticle?, otherAcceptedReadings?]
    for (const [surface, reading, particle, alts] of it.tokens) {
      if (!reading) continue;
      src += particle ? `(?:${PARTICLE_ALT[surface]})`
        : alts ? `(?:${[reading, ...alts].map((r) => esc(normKana(r))).join('|')})` : esc(normKana(reading));
    }
    const re = new RegExp('^' + src + '$');
    reCache.set(it.id, re);
    return re;
  }
  const sentenceReading = (it) => it.tokens.map(([s, r]) => r || s).join('');

  function readingsOf(it) {
    if (it.t === 'kana') return [it.c];
    if (it.t === 'kanji') return [...it.on, ...it.kun.flatMap(kunForms)];
    if (it.t === 'vocab') return it.r;
    if (it.t === 'sentence') return [sentenceReading(it)];
    return [];
  }
  // What the TTS voice should say
  function speechText(it) {
    if (it.t === 'kana') return it.c;
    if (it.t === 'kanji') return [...it.on.slice(0, 2).map(kataToHira), ...it.kun.slice(0, 2).map((k) => k.replace('.', ''))].join('、');
    if (it.t === 'vocab') return it.r[0];
    return spokenText(it.tokens);
  }
  // Sentence tokens [surface, reading] → text for the voice, with kanji words replaced by their kana
  // reading so Windows doesn't guess (it reads a lone お父さん as "ochichisan")
  function spokenText(tokens) {
    return tokens.map(([s, r]) => (r && /[㐀-鿿々]/.test(s) ? r : s)).join('');
  }

  function search(q) {
    q = q.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const kana = normKana(toKana(lower, { final: true }));
    const res = [];
    for (const it of items) {
      let score = -1;
      if (it.c === q) score = 100;
      else if (it.c.includes(q)) score = 60;
      else if (/^[぀-ヿ]+$/.test(kana) && readingsOf(it).some((r) => normKana(r) === kana)) score = 80;
      else if (/^[぀-ヿ]+$/.test(kana) && kana.length > 1 && readingsOf(it).some((r) => normKana(r).startsWith(kana))) score = 40;
      else if (it.meanings && it.meanings.some((m) => normMeaning(m) === normMeaning(lower))) score = 90;
      else if (lower.length > 2 && it.meanings && it.meanings.some((m) => normMeaning(m).includes(normMeaning(lower)))) score = 30;
      else if (it.t === 'sentence' && lower.length > 2 && it.en.toLowerCase().includes(lower)) score = 20;
      if (score >= 0) res.push([score, it]);
    }
    return res.sort((a, b) => (b[0] - a[0]) || (TYPE_ORDER[a[1].t] - TYPE_ORDER[b[1].t]) || (a[1].lvl - b[1].lvl)).slice(0, 120).map((r) => r[1]);
  }

  // ------------------------------------------------------------------ sync merge
  /** The more recently changed copy of an item. Items from before sync have no `t`: fall back to review counts. */
  function newerItem(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.t || b.t) return (a.t || 0) >= (b.t || 0) ? a : b;
    const na = (a.c || 0) + (a.w || 0), nb = (b.c || 0) + (b.w || 0);
    if (na !== nb) return na > nb ? a : b;
    return (a.s || 0) >= (b.s || 0) ? a : b;
  }
  /**
   * Combine two saves of the same progress (same epoch) from different devices. Pure: returns a new
   * state. Each item, note and synonym list keeps whichever side changed it last; daily counts keep
   * each device's own numbers; settings shared between devices follow the last change, and
   * device-only settings (theme, voice…) stay as they are on `local`.
   */
  function merge(local, remote) {
    const out = migrate(JSON.parse(JSON.stringify(local)));
    const R = migrate(JSON.parse(JSON.stringify(remote)));
    const L = local;
    for (const id of new Set([...Object.keys(out.items), ...Object.keys(R.items)])) out.items[id] = newerItem(out.items[id], R.items[id]);
    const keyed = (field, prefix) => {
      const ids = new Set([...Object.keys(L[field]), ...Object.keys(R[field]),
        ...Object.keys(R.mt).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))]);
      for (const id of ids) {
        const lt = (L.mt || {})[prefix + id] || 0, rt = R.mt[prefix + id] || 0;
        // the newer change wins; with no timestamps on either side, keep anything that only one side has
        if (rt > lt || (rt === lt && !(id in L[field]))) {
          if (id in R[field]) out[field][id] = R[field][id]; else delete out[field][id];
        }
      }
    };
    keyed('notes', 'n:');
    keyed('synonyms', 'y:');
    if ((R.mt.settings || 0) > (out.mt.settings || 0)) {
      for (const [k, v] of Object.entries(R.settings)) if (!DEVICE_SETTINGS.includes(k)) out.settings[k] = v;
    }
    if ((R.mt.vacation || 0) > (out.mt.vacation || 0)) out.vacation = R.vacation;
    for (const [k, v] of Object.entries(R.mt)) out.mt[k] = Math.max(out.mt[k] || 0, v);
    for (const [n, t] of Object.entries(R.levelLog)) out.levelLog[n] = out.levelLog[n] ? Math.min(out.levelLog[n], t) : t;
    Object.assign(out.levelForced, R.levelForced);
    out.level = Math.max(out.level, R.level);
    out.createdAt = Math.min(out.createdAt || Infinity, R.createdAt || Infinity);
    for (const [dev, log] of Object.entries(R.dayLog)) {
      const mine = out.dayLog[dev] || (out.dayLog[dev] = {});
      for (const [d, v] of Object.entries(log)) {
        const o = mine[d] || (mine[d] = { reviews: 0, correct: 0, lessons: 0 });
        for (const f of ['reviews', 'correct', 'lessons']) o[f] = Math.max(o[f] || 0, v[f] || 0);
      }
    }
    out.days = sumDays(out.dayLog);
    return out;
  }
  /** Take over another device's save outright (it was reset or imported more recently), keeping this device's own settings. */
  function adopt(local, remote) {
    const out = migrate(JSON.parse(JSON.stringify(remote)));
    for (const k of DEVICE_SETTINGS) if (k in local.settings) out.settings[k] = local.settings[k];
    return out;
  }
  /** Swap in synced progress without counting it as a new local change. */
  function replaceState(s) {
    quiet = true;
    try { state = migrate(s); refreshUnlocks(); save(true); } finally { quiet = false; }
  }

  async function init() {
    const loaded = await window.api.loadProgress();
    state = loaded ? migrate(loaded) : newState();
    refreshUnlocks();
    save(true);
  }

  window.SRS = {
    levels, items, byId, byLevel, vocabByKanji, sentencesByKanji, MAX_LEVEL,
    STAGE_NAMES, INTERVAL_HOURS, GURU, BURNED, stageGroup,
    get state() { return state; },
    init, save, flush, newState, migrate,
    /** Load a different save (import, reset, another folder). New epoch, so synced devices take it over instead of merging. */
    setState(s) { state = migrate(s); state.epoch = Date.now(); refreshUnlocks(); save(true); },
    replaceState, merge, adopt, onChange(fn) { changeListener = fn; }, deviceId, DEVICE_SETTINGS,
    setNote, setSynonyms, setSetting,
    prog, stageOf, levelProgress, refreshUnlocks, forceNextLevel,
    lessonQueue, lessonsLeftToday, reviewQueue, forecast, nextReviewAt, stageCounts, dayStats,
    completeLesson, completeReview, resetItem, practiceSets, leeches,
    levelUpEstimate, markKnown, startVacation, endVacation,
    promptsFor, grade, readingsOf, sentenceReading, speechText, spokenText, kunForms, search,
  };
})();
