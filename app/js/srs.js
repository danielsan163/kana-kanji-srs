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
  function newState() {
    return {
      version: 1,
      createdAt: Date.now(),
      level: 1,
      settings: { batchSize: 5, theme: 'dark', autoplayAudio: true, exampleFurigana: true, voice: '', maxLessonsPerDay: 0 },
      items: {},     // id -> { s: stage, u: unlockedAt, l: learnedAt, a: availableAt, b: burnedAt, c: correct, w: wrong }
      notes: {},     // id -> string
      synonyms: {},  // id -> [string]
      days: {},      // 'YYYY-MM-DD' -> { reviews, correct, lessons }
      levelLog: { 1: Date.now() },
    };
  }
  let state = null;

  function migrate(s) {
    const base = newState();
    s.settings = Object.assign(base.settings, s.settings || {});
    for (const k of ['items', 'notes', 'synonyms', 'days', 'levelLog']) s[k] = s[k] || base[k];
    s.level = Math.min(Math.max(1, s.level || 1), MAX_LEVEL);
    return s;
  }

  let saveTimer = null;
  function save(immediate) {
    clearTimeout(saveTimer);
    if (immediate) return window.api.saveProgress(state);
    saveTimer = setTimeout(() => window.api.saveProgress(state), 400);
  }
  function flush() { clearTimeout(saveTimer); window.api.saveProgressSync(state); }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function dayStats() {
    const k = today();
    return (state.days[k] = state.days[k] || { reviews: 0, correct: 0, lessons: 0 });
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
        state.items[it.id] = { s: 0, u: now, c: 0, w: 0 };
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
    refreshUnlocks();
    save(true);
  }

  // ------------------------------------------------------------------ queues
  function lessonQueue() {
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
    for (const [id, p] of Object.entries(state.items)) {
      if (p.s >= 1 && p.s < BURNED && p.a <= now && byId.has(id)) out.push(byId.get(id));
    }
    return out;
  }
  function forecast(hours = 24) {
    const now = Date.now();
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
    p.s = 1; p.l = now; p.a = nextAvailable(1, now);
    dayStats().lessons++;
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
    } else {
      const penalty = Math.ceil(wrongCount / 2) * (p.s >= GURU ? 2 : 1);
      p.s = Math.max(1, p.s - penalty);
      p.w++;
    }
    p.a = nextAvailable(p.s, now);
    if (p.s === BURNED) p.b = now;
    const d = dayStats();
    d.reviews++;
    if (wrongCount === 0) d.correct++;
    const unlocked = refreshUnlocks();
    save();
    return { before, after: p.s, unlocked };
  }
  function resetItem(id) {
    const p = state.items[id];
    if (!p) return;
    p.s = 0; delete p.a; delete p.l; delete p.b;
    save(true);
  }

  // ------------------------------------------------------------------ prompts
  const hasOn = (it) => it.t === 'kanji' && it.on.length > 0;
  const hasKun = (it) => it.t === 'kanji' && it.kun.length > 0;
  function promptsFor(it) {
    switch (it.t) {
      case 'kana': return ['reading'];
      case 'kanji': return ['meaning', ...(hasOn(it) ? ['on'] : []), ...(hasKun(it) ? ['kun'] : [])];
      case 'vocab': return ['meaning', 'reading'];
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
    for (const [surface, reading, particle] of it.tokens) {
      if (!reading) continue;
      src += particle ? `(?:${PARTICLE_ALT[surface]})` : esc(normKana(reading));
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
    return it.c;
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
    init, save, flush, newState, migrate, setState(s) { state = migrate(s); refreshUnlocks(); save(true); },
    prog, stageOf, levelProgress, refreshUnlocks, forceNextLevel,
    lessonQueue, lessonsLeftToday, reviewQueue, forecast, nextReviewAt, stageCounts, dayStats,
    completeLesson, completeReview, resetItem,
    promptsFor, grade, readingsOf, sentenceReading, speechText, kunForms, search,
  };
})();
