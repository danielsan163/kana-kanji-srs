// UI: routing, dashboard, lessons, reviews, browse, item details, settings
(function () {
  const { toKana, kataToHira, isJapanese } = window.Kana;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const view = $('#view');
  // Fallback when opened in a plain browser (UI testing): keep progress in localStorage
  if (!window.api) {
    const KEY = 'kks-progress';
    window.api = {
      loadProgress: async () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
      saveProgress: async (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return true; },
      saveProgressSync: (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return true; },
      getStrokes: async (ch) => { try { const r = await fetch('data/strokes.json'); return (await r.json())[ch] || null; } catch { return null; } },
      getExamples: async (type, key) => {
        try {
          const ex = await (await fetch('data/examples.json')).json();
          if (type === 'kanji') return ex.k[key] || [];
          return (ex.v[key] || []).map(([si, i0, i1]) => ({ tokens: ex.s[si][0], en: ex.s[si][1], id: ex.s[si][2], hl: [i0, i1] }));
        } catch { return []; }
      },
      exportProgress: async () => false, importProgress: async () => null,
      openDataFolder() {}, openSpeechSettings() {}, openLink(u) { window.open(u); },
    };
  }
  const TYPE_LABEL = { kana: 'Kana', kanji: 'Kanji', vocab: 'Vocabulary', sentence: 'Phrase' };

  // ------------------------------------------------------------------ routing & keys
  let current = { name: null, cleanup: null };
  let keyHandler = null;
  function go(name, arg) {
    closeModal(true);
    if (current.cleanup) current.cleanup();
    current = { name, cleanup: null };
    keyHandler = null;
    $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
    view.scrollTop = 0;
    VIEWS[name](arg);
    updateNav();
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    const itemEl = e.target.closest('[data-item]');
    if (itemEl && !e.target.closest('.no-open')) { openItem(itemEl.dataset.item); return; }
    const sp = e.target.closest('[data-speak]');
    if (sp) { Speech.speak(sp.dataset.speak); }
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#modal').classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (keyHandler) keyHandler(e);
  });
  window.addEventListener('beforeunload', () => SRS.flush());

  function updateNav() {
    const lessons = Math.min(SRS.lessonQueue().length, SRS.lessonsLeftToday());
    const reviews = SRS.reviewQueue().length;
    const nl = $('#nav-lessons'), nr = $('#nav-reviews');
    nl.textContent = lessons; nl.classList.toggle('hot', lessons > 0);
    nr.textContent = reviews; nr.classList.toggle('hot', reviews > 0);
    const lvl = SRS.levels[SRS.state.level - 1];
    $('#nav-level').textContent = `Level ${lvl.n} · ${lvl.name}`;
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function applyTheme() {
    const pref = SRS.state.settings.theme;
    const dark = pref === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : pref !== 'light';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // ------------------------------------------------------------------ speech
  const Speech = {
    voices: [],
    init() {
      const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^ja/i.test(v.lang)); };
      load();
      speechSynthesis.onvoiceschanged = () => { load(); if (current.name === 'settings' || current.name === 'dashboard') go(current.name); };
    },
    get available() { return this.voices.length > 0; },
    speak(text) {
      if (!text) return;
      if (!this.available) { toast('No Japanese voice installed. See Settings → Audio.'); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.voice = this.voices.find((v) => v.name === SRS.state.settings.voice) || this.voices[0];
      u.rate = 0.9;
      speechSynthesis.speak(u);
    },
  };
  const audioBtn = (text) => `<button class="audio-btn no-open" data-speak="${esc(text)}" title="Play audio">🔊</button>`;

  // ------------------------------------------------------------------ small renderers
  const hasKanji = (s) => /[一-鿿々]/.test(s);
  function furigana(surface, reading) {
    if (!hasKanji(surface) || !reading) return esc(surface);
    let s = [...surface], r = [...reading], pre = '', post = '';
    while (s.length > 1 && r.length && !hasKanji(s[s.length - 1]) && kataToHira(s[s.length - 1]) === r[r.length - 1]) { post = s.pop() + post; r.pop(); }
    while (s.length > 1 && r.length && !hasKanji(s[0]) && kataToHira(s[0]) === r[0]) { pre += s.shift(); r.shift(); }
    return esc(pre) + `<ruby>${esc(s.join(''))}<rt>${esc(r.join(''))}</rt></ruby>` + esc(post);
  }
  const sentenceHTML = (it, withFuri) => it.tokens.map(([s, r]) => (withFuri ? furigana(s, r) : esc(s))).join('');
  const kunHTML = (k) => { const [a, b] = k.split('.'); return esc(a) + (b ? `<span class="oku">${esc(b)}</span>` : ''); };

  function stageChip(it) {
    const s = SRS.stageOf(it.id);
    if (s < 0) return `<span class="stage-chip sg-locked">Locked</span>`;
    return `<span class="stage-chip sg-${SRS.stageGroup(s)}">${SRS.STAGE_NAMES[s]}</span>`;
  }
  function tile(it, opts = {}) {
    const s = SRS.stageOf(it.id);
    const label = it.t === 'sentence' ? esc(it.c.slice(0, 6) + (it.c.length > 6 ? '…' : '')) : esc(it.c);
    const cls = ['tile', 't-' + it.t, s < 0 ? 'locked' : '', opts.small ? 'small' : '', [...it.c].length > 2 ? 'wide' : ''].join(' ');
    const bar = s > 0 ? `<span class="stage-bar"><i style="width:${(s / 9) * 100}%"></i></span>` : '';
    return `<button class="${cls}" data-item="${esc(it.id)}" title="${esc(shortMeaning(it))} — ${s < 0 ? 'Locked' : SRS.STAGE_NAMES[s]}">${label}${bar}</button>`;
  }
  function shortMeaning(it) {
    if (it.t === 'kana') return it.romaji[0];
    if (it.t === 'sentence') return it.en;
    return it.meanings[0];
  }
  function relTime(ts) {
    const d = ts - Date.now();
    if (d <= 0) return 'now';
    const m = Math.round(d / 60000);
    if (m < 60) return `in ${m} min`;
    const h = Math.round(d / 3600e3);
    if (h < 48) return `in ${h} hour${h === 1 ? '' : 's'}`;
    const days = Math.round(d / 86400e3);
    if (days < 60) return `in ${days} days`;
    return `in ${Math.round(days / 30)} months`;
  }

  // ------------------------------------------------------------------ stroke order
  let strokeToken = 0;
  async function drawStrokes(box, ch) {
    const paths = await window.api.getStrokes(ch);
    if (!box.isConnected) return;
    if (!paths) { box.innerHTML = '<div class="faint">No stroke data</div>'; return; }
    const ns = 'http://www.w3.org/2000/svg';
    box.innerHTML = `<svg viewBox="0 0 109 109" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="ghost" stroke-width="3">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>
      <g class="ink" stroke-width="3.2">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>
      <div class="faint" style="font-size:12px">${paths.length} strokes · click to replay</div>`;
    const animate = () => {
      const token = ++strokeToken;
      const inks = $$('.ink path', box);
      inks.forEach((p) => { const L = p.getTotalLength(); p.style.transition = 'none'; p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
      let i = 0;
      const step = () => {
        if (token !== strokeToken || i >= inks.length || !box.isConnected) return;
        const p = inks[i++];
        const L = p.getTotalLength();
        const dur = Math.max(250, L * 6);
        p.getBoundingClientRect();
        p.style.transition = `stroke-dashoffset ${dur}ms ease-in-out`;
        p.style.strokeDashoffset = 0;
        setTimeout(step, dur + 120);
      };
      setTimeout(step, 200);
    };
    box.onclick = animate;
    void ns;
    animate();
  }

  // ------------------------------------------------------------------ item detail
  function sentencesWithVocab(v) { return SRS.items.filter((s) => s.t === 'sentence' && s.words.includes(v.c)).slice(0, 4); }
  const vocabInSentence = (s) => s.words.map((w) => SRS.byId.get('v:' + w)).filter(Boolean);
  function rowFor(it) {
    const reading = it.t === 'vocab' ? it.r[0] : it.t === 'kanji' ? (it.on[0] || '') : '';
    return `<div class="list-row" data-item="${esc(it.id)}"><span class="w">${esc(it.t === 'sentence' ? it.c : it.c)}</span>
      ${it.t !== 'sentence' ? `<span class="r">${esc(reading)}</span>` : ''}<span class="m">${esc(it.t === 'sentence' ? it.en : shortMeaning(it))}</span>${stageChip(it)}</div>`;
  }

  /** Full item info. opts.hideSrs: omit the SRS panel (lessons) */
  function renderDetail(container, it, opts = {}) {
    const p = SRS.prog(it.id);
    const main = [];
    const side = [];
    if (it.t === 'kana') {
      main.push(`<dl class="kv"><dt>Reading</dt><dd class="primary-meaning">${esc(it.romaji[0])} ${audioBtn(it.c)}</dd>
        ${it.romaji.length > 1 ? `<dt>Also accepted</dt><dd>${esc(it.romaji.slice(1).join(', '))}</dd>` : ''}
        <dt>Script</dt><dd>${esc(it.script)}</dd>
        <dt>Pair</dt><dd class="readings">${esc(it.script === 'hiragana' ? Kana.hiraToKata(it.c) : Kana.kataToHira(it.c))}</dd></dl>`);
    } else if (it.t === 'kanji') {
      main.push(`<dl class="kv"><dt>Meaning</dt><dd><span class="primary-meaning">${esc(it.meanings[0])}</span>
          ${it.meanings.length > 1 ? `<div class="muted">${esc(it.meanings.slice(1).join(', '))}</div>` : ''}</dd>
        <dt>On'yomi</dt><dd class="readings">${it.on.length ? esc(it.on.join('、')) : '<span class="faint">none</span>'}</dd>
        <dt>Kun'yomi</dt><dd class="readings">${it.kun.length ? it.kun.map(kunHTML).join('、') : '<span class="faint">none</span>'}</dd>
        <dt>Audio</dt><dd>${audioBtn(SRS.speechText(it))}</dd>
        <dt>Info</dt><dd class="muted">JLPT N${it.jlpt} · ${it.strokes} strokes · Level ${it.lvl}</dd></dl>`);
      side.push(`<div class="stroke-box" id="stroke-box">Loading…</div>`);
      const vs = SRS.vocabByKanji.get(it.c) || [];
      main.push(`<h3>Common words with ${esc(it.c)}</h3><div class="ex-box list-rows"><span class="faint">Loading…</span></div>`);
      if (vs.length) main.push(`<h3 class="study-head">Also in your study list</h3><div class="list-rows study-list">${vs.slice(0, 8).map(rowFor).join('')}</div>`);
    } else if (it.t === 'vocab') {
      main.push(`<dl class="kv"><dt>Meaning</dt><dd><span class="primary-meaning">${esc(it.meanings[0])}</span>
          ${it.meanings.length > 1 ? `<div class="muted">${esc(it.meanings.slice(1).join(', '))}</div>` : ''}
          ${it.alt && it.alt.length ? `<div class="faint" style="font-size:13px">Also accepted: ${esc(it.alt.join(', '))}</div>` : ''}</dd>
        <dt>Reading</dt><dd class="readings">${esc(it.r.join('、'))} ${audioBtn(it.r[0])}</dd>
        <dt>Info</dt><dd class="muted">JLPT N${it.jlpt} · Level ${it.lvl}</dd></dl>`);
      const ks = it.kanji.map((k) => SRS.byId.get('k:' + k)).filter(Boolean);
      main.push(`<h3>Kanji</h3><div class="list-rows">${ks.map(rowFor).join('')}</div>`);
      main.push(`<h3 class="row" style="justify-content:space-between">Example sentences
          <button class="btn small furi-toggle" title="Show or hide readings above kanji">Furigana: ${SRS.state.settings.exampleFurigana ? 'on' : 'off'}</button></h3>
        <div class="ex-box"><span class="faint">Loading…</span></div>`);
      const ss = sentencesWithVocab(it);
      if (ss.length) main.push(`<h3>Phrases you'll study</h3><div class="list-rows">${ss.map(rowFor).join('')}</div>`);
    } else if (it.t === 'sentence') {
      main.push(`<div class="jp" style="font-size:30px;line-height:2">${sentenceHTML(it, true)} ${audioBtn(it.c)}</div>
        <div class="translation">${esc(it.en)}</div>
        <div class="muted jp" style="margin-top:6px">${esc(SRS.sentenceReading(it))}</div>`);
      const vs = vocabInSentence(it);
      if (vs.length) main.push(`<h3>Words</h3><div class="list-rows">${vs.map(rowFor).join('')}</div>`);
      const ks = it.kanji.map((k) => SRS.byId.get('k:' + k)).filter(Boolean);
      main.push(`<h3>Kanji</h3><div class="tiles">${ks.map((k) => tile(k, { small: true })).join('')}</div>
        <div class="faint" style="font-size:12px;margin-top:10px">Sentence from Tatoeba (#${esc(it.id.slice(2))}). Readings are machine-generated and may occasionally be off.</div>`);
    }

    // notes & synonyms
    main.push(`<h3>Your mnemonic / notes</h3><textarea class="notes" placeholder="Write a mnemonic or anything that helps you remember…">${esc(SRS.state.notes[it.id] || '')}</textarea>`);
    if (it.t === 'kanji' || it.t === 'vocab') {
      const syn = SRS.state.synonyms[it.id] || [];
      main.push(`<h3>Your synonyms (accepted as meanings)</h3><div class="synonyms">${syn.map((s, i) => `<span class="chip">${esc(s)}<button data-del-syn="${i}" title="Remove">✕</button></span>`).join('')}
        <input class="syn-input" placeholder="+ add synonym, Enter"></div>`);
    }
    if (!opts.hideSrs) {
      side.push(`<div class="card" style="margin-top:12px"><h2>Progress</h2><div class="row">${stageChip(it)}</div>
        ${p && p.s >= 1 && p.s < SRS.BURNED ? `<div class="muted" style="margin-top:8px">Next review ${relTime(p.a)}</div>` : ''}
        ${p && p.s === 0 ? '<div class="muted" style="margin-top:8px">Waiting in your lessons</div>' : ''}
        ${!p ? `<div class="muted" style="margin-top:8px">Unlocks ${it.t === 'vocab' || it.t === 'sentence' ? 'when its kanji reach Guru' : `at level ${it.lvl}`}</div>` : ''}
        ${p && (p.c || p.w) ? `<div class="muted" style="margin-top:4px">Reviews: ${p.c} correct, ${p.w} incorrect</div>` : ''}
        ${p && p.s >= 1 ? `<button class="btn small" id="reset-item" style="margin-top:10px">Reset to lesson</button>` : ''}</div>`);
    }

    container.innerHTML = `<div class="detail-grid"><div>${main.join('')}</div><div>${side.join('')}</div></div>`;
    if (it.t === 'kanji') drawStrokes($('#stroke-box', container), it.c);
    if (it.t === 'kanji' || it.t === 'vocab') loadExamples(container, it);

    const notes = $('.notes', container);
    let nt;
    notes.addEventListener('input', () => {
      clearTimeout(nt);
      nt = setTimeout(() => {
        const v = notes.value.trim();
        if (v) SRS.state.notes[it.id] = notes.value; else delete SRS.state.notes[it.id];
        SRS.save();
      }, 300);
    });
    notes.addEventListener('keydown', (e) => e.stopPropagation());
    const synIn = $('.syn-input', container);
    if (synIn) {
      synIn.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && synIn.value.trim()) {
          (SRS.state.synonyms[it.id] = SRS.state.synonyms[it.id] || []).push(synIn.value.trim());
          SRS.save();
          renderDetail(container, it, opts);
          $('.syn-input', container).focus();
        }
      });
      $$('[data-del-syn]', container).forEach((b) => b.addEventListener('click', () => {
        SRS.state.synonyms[it.id].splice(+b.dataset.delSyn, 1);
        SRS.save();
        renderDetail(container, it, opts);
      }));
    }
    const reset = $('#reset-item', container);
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('Move this item back to your lessons? Its SRS progress will be lost.')) return;
      SRS.resetItem(it.id);
      renderDetail(container, it, opts);
      updateNav();
    });
  }

  // ------------------------------------------------------------------ reference examples
  async function loadExamples(container, it) {
    const box = $('.ex-box', container);
    const data = await window.api.getExamples(it.t, it.c);
    if (!box.isConnected) return;
    if (it.t === 'kanji') {
      box.innerHTML = data.length ? data.map(([w, r, m]) => {
        const studied = SRS.byId.get('v:' + w);
        const word = [...w].map((ch) => (ch === it.c ? `<span class="hl-kanji">${esc(ch)}</span>` : esc(ch))).join('');
        return `<div class="list-row ${studied ? '' : 'ref'}" ${studied ? `data-item="${esc(studied.id)}"` : ''}>
          <span class="w">${word}</span><span class="r">${esc(r)}</span><span class="m">${esc(m)}</span>
          ${audioBtn(r)}${studied ? stageChip(studied) : '<span class="stage-chip sg-locked" title="Shown for reference; not part of your reviews">Reference</span>'}</div>`;
      }).join('') : '<span class="faint">No common words found for this kanji.</span>';
      // Don't repeat words that are already in the common list
      const shown = new Set(data.map(([w]) => 'v:' + w));
      const list = $('.study-list', container);
      if (list) {
        $$('.list-row', list).forEach((row) => { if (shown.has(row.dataset.item)) row.remove(); });
        if (!list.children.length) { list.remove(); $('.study-head', container)?.remove(); }
      }
      return;
    }
    const render = () => {
      const furi = SRS.state.settings.exampleFurigana;
      box.innerHTML = data.length ? data.map((ex) => {
        const html = ex.tokens.map(([s, r], i) => {
          const t = furi && r ? furigana(s, r) : esc(s);
          return i >= ex.hl[0] && i <= ex.hl[1] ? `<mark class="hl">${t}</mark>` : t;
        }).join('');
        const text = ex.tokens.map((t) => t[0]).join('');
        return `<div class="ex-sentence"><div class="ex-jp jp">${html} ${audioBtn(text)}</div><div class="ex-en">${esc(ex.en)}</div></div>`;
      }).join('') + '<div class="faint" style="font-size:12px">Sentences from Tatoeba · readings are machine-generated</div>'
        : '<span class="faint">No example sentences found for this word.</span>';
    };
    render();
    const btn = $('.furi-toggle', container);
    if (btn) btn.onclick = () => {
      SRS.state.settings.exampleFurigana = !SRS.state.settings.exampleFurigana;
      SRS.save();
      btn.textContent = `Furigana: ${SRS.state.settings.exampleFurigana ? 'on' : 'off'}`;
      render();
    };
  }

  function subjectHTML(it, opts = {}) {
    let cls = 'char';
    const n = [...it.c].length;
    if (it.t === 'sentence') cls += ' sentence';
    else if (n >= 5) cls += ' len-long';
    else if (n > 1) cls += ' len-' + n;
    const content = it.t === 'sentence' ? sentenceHTML(it, !!opts.furigana) : esc(it.c);
    return `<div class="subject t-${it.t}"><span class="type-tag">${TYPE_LABEL[it.t]}</span><div class="${cls}">${content}</div></div>`;
  }

  // ------------------------------------------------------------------ modal
  function openItem(id) {
    const it = SRS.byId.get(id);
    if (!it) return;
    $('#modal-card').innerHTML = `<button class="modal-close" title="Close (Esc)">✕</button>
      <div class="row" style="margin-bottom:14px">${tile(it)}<div><div style="font-weight:700">${TYPE_LABEL[it.t]} · Level ${it.lvl}</div>
      <div class="muted">${esc(shortMeaning(it))}</div></div></div><div id="modal-body"></div>`;
    $('#modal').classList.remove('hidden');
    renderDetail($('#modal-body'), it);
    $('.modal-close').onclick = () => closeModal();
  }
  function closeModal(navigating) {
    const m = $('#modal');
    if (m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    $('#modal-card').innerHTML = '';
    if (!navigating && (current.name === 'dashboard' || current.name === 'browse')) VIEWS[current.name].refresh?.();
    updateNav();
  }
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

  // ------------------------------------------------------------------ dashboard
  function viewDashboard() {
    const st = SRS.state;
    const lessons = SRS.lessonQueue();
    const lessonsAvail = Math.min(lessons.length, SRS.lessonsLeftToday());
    const reviews = SRS.reviewQueue().length;
    const next = SRS.nextReviewAt();
    const lp = SRS.levelProgress(st.level);
    const lvl = SRS.levels[st.level - 1];
    const counts = SRS.stageCounts();
    const fc = SRS.forecast(24);
    const fc7 = SRS.forecast(24 * 7);
    const maxBar = Math.max(1, ...fc.buckets);
    const today = SRS.dayStats();
    const gating = SRS.byLevel.get(st.level).filter((it) => it.t === 'kana' || it.t === 'kanji');
    const others = SRS.byLevel.get(st.level).filter((it) => it.t === 'vocab' || it.t === 'sentence');
    let cumulative = reviews;

    const bars = fc.buckets.map((n, i) => {
      cumulative += n;
      const t = new Date(fc.start + i * 3600e3);
      const label = t.toLocaleTimeString([], { hour: 'numeric' });
      return `<div class="bar-slot"><div class="tip">${label}: ${n} new · ${cumulative} total</div><div class="bar" style="height:${(n / maxBar) * 100}%"></div></div>`;
    }).join('');
    const axis = fc.buckets.map((_, i) => {
      const t = new Date(fc.start + i * 3600e3);
      return `<span>${i % 4 === 0 ? t.toLocaleTimeString([], { hour: 'numeric' }).replace(':00', '') : ''}</span>`;
    }).join('');
    const days = [];
    for (let d = 0; d < 7; d++) {
      const n = fc7.buckets.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0);
      const t = new Date(fc7.start + d * 86400e3);
      days.push(`<div>${d === 0 ? 'Next 24h' : t.toLocaleDateString([], { weekday: 'short' })}<b>${n}</b></div>`);
    }
    const streak = (() => {
      const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const active = (d) => { const s = st.days[key(d)]; return !!(s && (s.reviews || s.lessons)); };
      const d = new Date();
      if (!active(d)) d.setDate(d.getDate() - 1); // today doesn't break the streak until it's over
      let n = 0;
      while (active(d) && n < 10000) { n++; d.setDate(d.getDate() - 1); }
      return n;
    })();

    view.innerHTML = `<div class="page">
      <div class="grid cols-2">
        <button class="big-action lessons" id="go-lessons" ${lessonsAvail ? '' : 'disabled'}>
          <div class="label">Lessons</div><div class="count">${lessonsAvail}</div>
          <div class="sub">${lessonsAvail ? 'New items ready to learn' : lessons.length ? 'Daily lesson limit reached' : 'No new lessons. Level up to unlock more'}</div></button>
        <button class="big-action reviews" id="go-reviews" ${reviews ? '' : 'disabled'}>
          <div class="label">Reviews</div><div class="count">${reviews}</div>
          <div class="sub">${reviews ? 'Ready now' : next ? `Next review ${relTime(next)}` : 'Finish some lessons first'}</div></button>
      </div>
      ${!Speech.available ? `<div class="card" style="margin-top:16px;border-color:var(--sentence)">🔈 No Japanese text-to-speech voice found, so audio is off. <a href="#" id="voice-help">How to install it</a></div>` : ''}
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <h2>Level ${lvl.n} <span class="muted" style="font-weight:500">· ${esc(lvl.name)}</span></h2>
          <div class="muted" style="margin-bottom:8px">${lp.guru} / ${lp.total} ${lvl.kind === 'kana' ? 'kana' : 'kanji'} at Guru · ${lp.needed} needed to level up</div>
          <div class="progress"><div style="width:${(lp.guru / lp.total) * 100}%"></div><span class="goal" style="left:90%"></span></div>
          <h3>${lvl.kind === 'kana' ? 'Kana' : 'Kanji'}</h3><div class="tiles">${gating.map((it) => tile(it)).join('')}</div>
          ${others.length ? `<h3>Vocabulary & phrases</h3><div class="tiles">${others.map((it) => tile(it, { small: true })).join('')}</div>` : ''}
          <div class="row" style="margin-top:16px">
            ${st.level < SRS.MAX_LEVEL ? `<button class="btn" id="force-level">Unlock level ${st.level + 1} now</button>
            <span class="faint" style="font-size:12px">For material you already know. Items still go through lessons.</span>` : ''}
          </div>
        </div>
        <div class="card">
          <h2>Upcoming reviews</h2>
          <div class="muted" style="font-size:13px">Next 24 hours, by hour · hover a bar for totals</div>
          <div class="forecast">${bars}</div>
          <div class="forecast-base"></div>
          <div class="forecast-axis">${axis}</div>
          <div class="week-list">${days.join('')}</div>
          <h3>Today</h3>
          <div class="row" style="gap:24px">
            <div><b style="font-size:22px">${today.reviews}</b><div class="muted" style="font-size:12px">reviews</div></div>
            <div><b style="font-size:22px">${today.reviews ? Math.round((today.correct / today.reviews) * 100) + '%' : '—'}</b><div class="muted" style="font-size:12px">items correct</div></div>
            <div><b style="font-size:22px">${today.lessons}</b><div class="muted" style="font-size:12px">lessons</div></div>
            <div><b style="font-size:22px">${streak}</b><div class="muted" style="font-size:12px">day streak</div></div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>SRS stages</h2>
        <div class="stat-tiles">
          ${[['apprentice', 'Apprentice'], ['guru', 'Guru'], ['master', 'Master'], ['enlightened', 'Enlightened'], ['burned', 'Burned']]
            .map(([k, l]) => `<div class="stat-tile" style="--c:var(--st-${k})"><div class="n">${counts[k]}</div><div class="l">${l}</div></div>`).join('')}
        </div>
      </div>
    </div>`;
    $('#go-lessons').onclick = () => go('lessons');
    $('#go-reviews').onclick = () => go('reviews');
    const fl = $('#force-level');
    if (fl) fl.onclick = () => {
      if (!confirm(`Unlock level ${st.level + 1} now? Its kanji will be added to your lessons.`)) return;
      SRS.forceNextLevel();
      toast(`Level ${SRS.state.level} unlocked`);
      go('dashboard');
    };
    const vh = $('#voice-help');
    if (vh) vh.onclick = (e) => { e.preventDefault(); go('settings'); };
    const timer = setInterval(() => { SRS.refreshUnlocks(); if ($('#modal').classList.contains('hidden')) viewDashboard.refresh(); updateNav(); }, 60e3);
    current.cleanup = () => clearInterval(timer);
  }
  viewDashboard.refresh = () => { if (current.cleanup) current.cleanup(); viewDashboard(); };

  // ------------------------------------------------------------------ lessons
  function viewLessons() {
    const queue = SRS.lessonQueue();
    const left = SRS.lessonsLeftToday();
    if (!queue.length || !left) {
      view.innerHTML = `<div class="page"><div class="card" style="text-align:center;padding:40px">
        <h1>${queue.length ? 'Daily lesson limit reached' : 'No lessons available'}</h1>
        <p class="muted">${queue.length ? 'You can change the limit in Settings.' : 'Get your current level\'s items to Guru to unlock more, or unlock the next level from the dashboard.'}</p>
        <button class="btn primary" data-go="dashboard">Back to dashboard</button></div></div>`;
      return;
    }
    const batch = queue.slice(0, Math.min(SRS.state.settings.batchSize, left));
    let i = 0;
    const seen = new Set();

    function show() {
      const it = batch[i];
      seen.add(i);
      view.innerHTML = `<div class="quiz">
        <div class="quiz-top"><span>Lessons · ${queue.length} remaining</span><span class="spacer"></span>
          <button class="btn small" data-go="dashboard">Exit</button></div>
        <div class="lesson-strip">${batch.map((b, j) => tile(b, { small: true }).replace('class="tile', `data-j="${j}" class="tile ${j === i ? 'current' : seen.has(j) ? 'seen' : ''}`).replace(/data-item="[^"]*"/, '')).join('')}</div>
        ${subjectHTML(it, { furigana: true })}
        <div class="card lesson-body" id="lesson-detail"></div>
        <div class="lesson-nav">
          <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>← Previous</button>
          ${i < batch.length - 1 ? '<button class="btn primary" id="next">Next <span class="kbd">Enter</span></button>'
            : '<button class="btn primary" id="quiz">Start quiz <span class="kbd">Enter</span></button>'}
        </div></div>`;
      renderDetail($('#lesson-detail'), it, { hideSrs: true });
      $$('.lesson-strip .tile').forEach((t) => t.addEventListener('click', () => { i = +t.dataset.j; show(); }));
      $('#prev').onclick = prev;
      if ($('#next')) $('#next').onclick = next;
      if ($('#quiz')) $('#quiz').onclick = startQuiz;
      if (SRS.state.settings.autoplayAudio && Speech.available && it.t !== 'kanji') Speech.speak(SRS.speechText(it));
    }
    const next = () => { if (i < batch.length - 1) { i++; show(); } else startQuiz(); };
    const prev = () => { if (i > 0) { i--; show(); } };
    keyHandler = (e) => {
      if (e.target.matches('textarea, input')) return;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
    };
    function startQuiz() {
      runQuiz({
        items: batch,
        mode: 'lesson',
        title: 'Lesson quiz',
        onItemDone: (it) => SRS.completeLesson(it),
        onFinish: () => {
          keyHandler = (e) => { if (e.key === 'Enter') go(SRS.lessonQueue().length ? 'lessons' : 'dashboard'); };
          const more = Math.min(SRS.lessonQueue().length, SRS.lessonsLeftToday());
          view.innerHTML = `<div class="page"><div class="card" style="text-align:center;padding:40px">
            <h1>Lessons complete 🎉</h1><p class="muted">${batch.length} items moved to Apprentice. First review in about 4 hours.</p>
            <div class="tiles" style="justify-content:center;margin:16px 0">${batch.map((b) => tile(b)).join('')}</div>
            <div class="row" style="justify-content:center">
              ${more ? `<button class="btn primary" data-go="lessons">More lessons (${more}) <span class="kbd">Enter</span></button>` : ''}
              <button class="btn" data-go="dashboard">Dashboard</button></div></div></div>`;
          updateNav();
        },
      });
    }
    show();
  }

  // ------------------------------------------------------------------ quiz engine (lesson quiz + reviews)
  const PROMPT_INFO = {
    meaning: { label: 'Meaning', cls: 'meaning' },
    reading: { label: 'Reading', cls: 'reading' },
    on: { label: "On'yomi", cls: 'reading', hint: 'katakana' },
    kun: { label: "Kun'yomi", cls: 'reading', hint: 'hiragana' },
    translate: { label: 'Meaning', cls: 'meaning', hint: 'think it through, then check' },
  };
  function promptLabel(it, prompt) {
    const info = PROMPT_INFO[prompt];
    let hint = info.hint;
    if (prompt === 'reading') hint = it.t === 'kana' ? 'type in romaji' : it.t === 'sentence' ? 'type the whole phrase in kana' : 'kana';
    return `${it.t === 'kanji' ? 'Kanji' : TYPE_LABEL[it.t]} <b>${info.label}</b>${hint ? `<span class="hint">(${hint})</span>` : ''}`;
  }

  function runQuiz({ items, mode, title, onItemDone, onFinish }) {
    const pending = shuffle(items.slice());
    const active = [];
    const ACTIVE_MAX = mode === 'lesson' ? Infinity : 10;
    const total = items.length;
    const done = [];        // { it, wrong, before, after }
    let answered = 0, correctAnswers = 0, wrapUp = false;
    let cur = null;         // { st, prompt }
    let phase = 'answer';   // answer | graded | reveal
    let lastWasWrong = false;
    let lastItemId = null;
    let infoOpen = false;
    const unlockedAll = [];

    function fill() {
      while (!wrapUp && active.length < ACTIVE_MAX && pending.length) {
        const it = pending.shift();
        active.push({ it, prompts: SRS.promptsFor(it), wrong: 0, readingDone: false });
      }
    }
    function next() {
      fill();
      if (!active.length) return finish();
      let pool = active.length > 1 ? active.filter((s) => s.it.id !== lastItemId) : active;
      const st = pool[Math.floor(Math.random() * pool.length)];
      // Sentences: reading before meaning so the reveal shows furigana at the right moment
      const prompt = st.it.t === 'sentence' ? st.prompts[0] : st.prompts[Math.floor(Math.random() * st.prompts.length)];
      cur = { st, prompt };
      lastItemId = st.it.id;
      phase = prompt === 'translate' ? 'reveal' : 'answer';
      lastWasWrong = false;
      infoOpen = false;
      render();
    }

    function render(message = '') {
      const { st, prompt } = cur;
      const it = st.it;
      const info = PROMPT_INFO[prompt];
      const pct = answered ? Math.round((correctAnswers / answered) * 100) : 100;
      const isTranslate = prompt === 'translate';
      view.innerHTML = `<div class="quiz">
        <div class="quiz-top"><span>${esc(title)}</span>
          <span id="stat-done">✓ ${done.length} / ${total}</span><span id="stat-pct">${pct}% correct</span>
          <span class="spacer"></span>
          ${mode === 'review' ? `<button class="btn small" id="wrap" ${wrapUp ? 'disabled' : ''}>${wrapUp ? `Wrapping up (${active.length})` : 'Wrap up'}</button>` : ''}
          <button class="btn small" id="exit">Exit</button></div>
        ${subjectHTML(it, { furigana: it.t === 'sentence' && (st.readingDone || (phase === 'graded' && prompt === 'reading')) })}
        <div class="prompt-bar ${info.cls}">${promptLabel(it, prompt)}</div>
        ${isTranslate ? `<div class="self-check" id="self-check">
            ${phase === 'reveal' ? `<div class="muted">What does this phrase mean? Say it in your head.</div>
              <button class="btn primary" id="reveal">Show translation <span class="kbd">Enter</span></button>`
            : `<div class="translation">${esc(it.en)}</div>
              ${phase === 'selfgrade' ? `<div class="row"><button class="btn" id="got" style="border-color:var(--ok)">I understood it <span class="kbd">1</span></button>
                <button class="btn" id="missed" style="border-color:var(--bad)">I missed it <span class="kbd">2</span></button></div>` : ''}`}
          </div>`
        : `<div class="answer-row"><input class="answer" id="answer" autocomplete="off" spellcheck="false" placeholder="${prompt === 'meaning' ? 'Your answer' : prompt === 'on' ? '答え (katakana)' : it.t === 'kana' ? 'romaji' : '答え'}">
          <button class="answer-submit" id="submit" title="Submit (Enter)">➜</button></div>`}
        <div class="quiz-msg" id="msg">${esc(message)}</div>
        <div class="quiz-actions" id="actions"></div>
        <div class="card info-panel hidden" id="info"></div>
      </div>`;
      $('#exit').onclick = () => {
        if (mode === 'review' && done.length < total && !confirm('Exit reviews? Items you finished are saved; unfinished ones stay in your queue.')) return;
        go('dashboard');
      };
      const wrap = $('#wrap');
      if (wrap) wrap.onclick = () => { wrapUp = true; pending.length = 0; render(); if (phase === 'answer') $('#answer')?.focus(); };
      if (isTranslate) {
        if ($('#reveal')) $('#reveal').onclick = () => { phase = 'selfgrade'; render(); };
        if ($('#got')) $('#got').onclick = () => selfGrade(true);
        if ($('#missed')) $('#missed').onclick = () => selfGrade(false);
        if (phase === 'graded') showGradedActions();
        return;
      }
      const input = $('#answer');
      const kanaMode = (prompt === 'reading' && it.t !== 'kana') || prompt === 'on' || prompt === 'kun';
      const katakana = prompt === 'on';
      input.addEventListener('input', (e) => {
        if (!kanaMode || e.isComposing) return;
        const v = toKana(input.value, { katakana });
        if (v !== input.value) input.value = v;
      });
      $('#submit').onclick = submit;
      input.focus();
    }

    function selfGrade(ok) {
      answered++;
      if (ok) {
        correctAnswers++;
        cur.st.prompts = cur.st.prompts.filter((p) => p !== 'translate');
      } else cur.st.wrong++;
      lastWasWrong = !ok;
      phase = 'graded';
      render();
      $('#msg').textContent = ok ? '' : 'It will come back later in this session.';
      maybeFinishItem();
    }

    function submit() {
      if (phase !== 'answer') return;
      const input = $('#answer');
      const { st, prompt } = cur;
      const kanaMode = (prompt === 'reading' && st.it.t !== 'kana') || prompt === 'on' || prompt === 'kun';
      if (kanaMode) input.value = toKana(input.value, { katakana: prompt === 'on', final: true });
      const g = SRS.grade(st.it, prompt, input.value);
      if (g.result === 'retry') {
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
        $('#msg').textContent = g.message || '';
        return;
      }
      answered++;
      phase = 'graded';
      input.readOnly = true;
      if (g.result === 'correct') {
        correctAnswers++;
        input.classList.add('correct');
        st.prompts = st.prompts.filter((p) => p !== prompt);
        if (prompt === 'reading') st.readingDone = true;
        lastWasWrong = false;
        $('#msg').textContent = g.close ? g.message : '';
        if (prompt !== 'meaning' && SRS.state.settings.autoplayAudio && Speech.available && st.it.t !== 'kanji') Speech.speak(SRS.speechText(st.it));
        if (st.it.t === 'sentence' && prompt === 'reading') {
          $('.subject .char').innerHTML = sentenceHTML(st.it, true);
        }
      } else {
        st.wrong++;
        lastWasWrong = true;
        input.classList.add('wrong');
        $('#msg').innerHTML = 'Not quite. Press <b>F</b> to see the answer, or <b>Backspace</b> if it was a typo.';
      }
      showGradedActions();
      maybeFinishItem();
    }

    function updateStats() {
      const d = $('#stat-done'), p = $('#stat-pct');
      if (d) d.textContent = `✓ ${done.length} / ${total}`;
      if (p) p.textContent = `${answered ? Math.round((correctAnswers / answered) * 100) : 100}% correct`;
    }
    function showGradedActions() {
      updateStats();
      $('#actions').innerHTML = `
        <button class="btn" id="info-btn">Item info <span class="kbd">F</span></button>
        ${lastWasWrong ? '<button class="btn" id="undo">I made a typo, let me retry <span class="kbd">Backspace</span></button>' : ''}
        <button class="btn primary" id="next-btn">Next <span class="kbd">Enter</span></button>`;
      $('#info-btn').onclick = toggleInfo;
      if ($('#undo')) $('#undo').onclick = undo;
      $('#next-btn').onclick = next;
    }
    function toggleInfo() {
      infoOpen = !infoOpen;
      const panel = $('#info');
      panel.classList.toggle('hidden', !infoOpen);
      if (infoOpen) renderDetail(panel, cur.st.it, { hideSrs: mode === 'lesson' });
    }
    function undo() {
      if (phase !== 'graded' || !lastWasWrong) return;
      cur.st.wrong--;
      answered--;
      lastWasWrong = false;
      phase = cur.prompt === 'translate' ? 'selfgrade' : 'answer';
      render();
    }
    function maybeFinishItem() {
      const st = cur.st;
      if (st.prompts.length) return;
      active.splice(active.indexOf(st), 1);
      if (mode === 'review') {
        const res = SRS.completeReview(st.it, st.wrong);
        done.push({ it: st.it, wrong: st.wrong, ...res });
        unlockedAll.push(...res.unlocked);
        const msg = $('#msg');
        if (msg && !lastWasWrong) {
          const up = res.after > res.before;
          msg.innerHTML = `${esc(SRS.STAGE_NAMES[res.before])} → <b>${esc(SRS.STAGE_NAMES[res.after])}</b>${up ? ' ↑' : ''}`;
        }
      } else {
        onItemDone(st.it);
        done.push({ it: st.it, wrong: st.wrong });
      }
      updateStats();
      updateNav();
    }

    function finish() {
      keyHandler = null;
      if (mode === 'lesson') return onFinish();
      const right = done.filter((d) => d.wrong === 0);
      const wrongs = done.filter((d) => d.wrong > 0);
      keyHandler = (e) => { if (e.key === 'Enter') go('dashboard'); };
      view.innerHTML = `<div class="page"><div class="card" style="padding:28px">
        <h1>Review summary</h1>
        <p class="muted">${done.length} items reviewed · ${done.length ? Math.round((right.length / done.length) * 100) : 0}% correct
        ${unlockedAll.length ? ` · <b>${unlockedAll.length} new items unlocked</b>` : ''}</p>
        <h3>Correct (${right.length})</h3><div class="summary-list">${right.map((d) => tile(d.it, { small: true })).join('') || '<span class="faint">—</span>'}</div>
        <h3>Needs work (${wrongs.length})</h3><div class="summary-list">${wrongs.map((d) => tile(d.it, { small: true })).join('') || '<span class="faint">—</span>'}</div>
        <div class="row" style="margin-top:22px">
          <button class="btn primary" data-go="dashboard">Dashboard <span class="kbd">Enter</span></button>
          ${SRS.lessonQueue().length ? '<button class="btn" data-go="lessons">Lessons</button>' : ''}
          ${SRS.reviewQueue().length ? '<button class="btn" data-go="reviews">More reviews</button>' : ''}
        </div></div></div>`;
      updateNav();
    }

    keyHandler = (e) => {
      if (e.target.matches('textarea, .syn-input')) return;
      if (phase === 'answer') {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      } else if (phase === 'reveal') {
        if (e.key === 'Enter') { e.preventDefault(); phase = 'selfgrade'; render(); }
      } else if (phase === 'selfgrade') {
        if (e.key === '1') selfGrade(true);
        if (e.key === '2') selfGrade(false);
      } else if (phase === 'graded') {
        if (e.key === 'Enter') { e.preventDefault(); next(); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleInfo(); }
        else if (e.key === 'Backspace' && lastWasWrong) { e.preventDefault(); undo(); }
      }
    };
    next();
  }

  function viewReviews() {
    const q = SRS.reviewQueue();
    if (!q.length) {
      const next = SRS.nextReviewAt();
      view.innerHTML = `<div class="page"><div class="card" style="text-align:center;padding:40px">
        <h1>No reviews right now</h1><p class="muted">${next ? `Next review ${relTime(next)}.` : 'Do some lessons to start reviewing.'}</p>
        <button class="btn primary" data-go="dashboard">Back to dashboard</button></div></div>`;
      return;
    }
    runQuiz({ items: q, mode: 'review', title: 'Reviews' });
  }

  // ------------------------------------------------------------------ browse
  let browseLevel = null;
  let browseQuery = '';
  function viewBrowse() {
    const st = SRS.state;
    if (browseLevel === null) browseLevel = st.level;
    view.innerHTML = `<div class="page">
      <input class="search" id="search" placeholder="Search: kanji, word, meaning, or reading (romaji or kana)…" value="${esc(browseQuery)}">
      <div id="browse-body" style="margin-top:16px"></div></div>`;
    const input = $('#search');
    input.addEventListener('input', () => { browseQuery = input.value; renderBody(); });
    input.focus();
    function renderBody() {
      const body = $('#browse-body');
      if (browseQuery.trim()) {
        const res = SRS.search(browseQuery);
        body.innerHTML = `<div class="card"><h2>${res.length} result${res.length === 1 ? '' : 's'}</h2><div class="list-rows">${res.map(rowFor).join('')}</div></div>`;
        return;
      }
      const cells = SRS.levels.map((l) => {
        const lp = SRS.levelProgress(l.n);
        return `<div class="level-cell ${l.n === st.level ? 'current' : ''} ${l.n > st.level ? 'locked' : ''}" data-level="${l.n}" style="${l.n === browseLevel ? 'outline:2px solid var(--text-2)' : ''}">
          <b>${l.n}</b><small>${esc(l.kind === 'kana' ? l.name.split(' ')[0] : l.name.replace('JLPT ', ''))}</small>
          <div class="progress"><div style="width:${(lp.guru / lp.total) * 100}%"></div></div></div>`;
      }).join('');
      const lvl = SRS.levels[browseLevel - 1];
      const its = SRS.byLevel.get(browseLevel);
      const group = (t) => its.filter((it) => it.t === t);
      const section = (t, name) => {
        const g = group(t);
        if (!g.length) return '';
        if (t === 'sentence') return `<h3>${name} (${g.length})</h3><div class="list-rows">${g.map(rowFor).join('')}</div>`;
        return `<h3>${name} (${g.length})</h3><div class="tiles">${g.map((it) => tile(it, { small: t === 'vocab' })).join('')}</div>`;
      };
      body.innerHTML = `<div class="grid" style="grid-template-columns: 1fr 1.4fr; align-items:start">
        <div class="card"><h2>Levels</h2><div class="level-grid">${cells}</div></div>
        <div class="card"><h2>Level ${lvl.n} · ${esc(lvl.name)} ${lvl.n > st.level ? '<span class="stage-chip sg-locked">Locked</span>' : ''}</h2>
          ${section('kana', 'Kana')}${section('kanji', 'Kanji')}${section('vocab', 'Vocabulary')}${section('sentence', 'Phrases')}</div></div>`;
      $$('.level-cell', body).forEach((c) => c.addEventListener('click', () => { browseLevel = +c.dataset.level; renderBody(); }));
    }
    viewBrowse.refresh = renderBody;
    renderBody();
  }

  // ------------------------------------------------------------------ settings
  function viewSettings() {
    const s = SRS.state.settings;
    view.innerHTML = `<div class="page" style="max-width:800px">
      <h1>Settings</h1>
      <div class="card">
        <h2>Study</h2>
        <div class="setting"><div><b>Lesson batch size</b><div class="desc">How many new items per lesson session before the quiz.</div></div>
          <input type="number" id="batch" min="1" max="30" value="${s.batchSize}" style="width:80px"></div>
        <div class="setting"><div><b>Daily lesson limit</b><div class="desc">0 = unlimited. Keeps your review pile manageable.</div></div>
          <input type="number" id="maxl" min="0" max="500" value="${s.maxLessonsPerDay}" style="width:80px"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Appearance</h2>
        <div class="setting"><div><b>Theme</b></div>
          <select id="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Match Windows</option></select></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Audio</h2>
        ${Speech.available ? `
        <div class="setting"><div><b>Japanese voice</b></div>
          <div class="row"><select id="voice">${Speech.voices.map((v) => `<option ${v.name === s.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
          <button class="btn small" id="test-voice">Test</button></div></div>` : `
        <div class="setting"><div><b>No Japanese voice installed</b><div class="desc">Windows Settings → Time &amp; language → Language &amp; region → Add a language → Japanese, and make sure <b>Text-to-speech</b> is ticked.
          Or open Speech settings → Manage voices → Add voices → Japanese. Restart this app afterwards.</div></div>
          <button class="btn" id="speech-settings">Open speech settings</button></div>`}
        <div class="setting"><div><b>Autoplay audio</b><div class="desc">Play the reading after a correct reading answer and when a lesson opens.</div></div>
          <input type="checkbox" id="autoplay" ${s.autoplayAudio ? 'checked' : ''}></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Your data</h2>
        <div class="setting"><div><b>Progress file</b><div class="desc">Saved automatically to %APPDATA%\\KanaKanjiSRS\\progress.json, with a backup each day (last 14 kept).</div></div>
          <button class="btn" id="open-folder">Open folder</button></div>
        <div class="setting"><div><b>Export / import</b><div class="desc">Move your progress to another PC, or restore a backup.</div></div>
          <div class="row"><button class="btn" id="export">Export…</button><button class="btn" id="import">Import…</button></div></div>
        <div class="setting"><div><b>Reset all progress</b><div class="desc">Start over from level 1. Your notes are kept.</div></div>
          <button class="btn danger" id="reset">Reset…</button></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Credits &amp; licenses</h2>
        <div class="muted" style="font-size:13px;line-height:1.7">
          Kanji data: KANJIDIC2 © EDRDG (CC BY-SA 4.0), via <a href="#" data-link="https://github.com/davidluzgouveia/kanji-data">kanji-data</a>, including JLPT levels from Jonathan Waller's lists.<br>
          Vocabulary: JLPT lists by Jonathan Waller (CC BY) via <a href="#" data-link="https://github.com/jamsinclair/open-anki-jlpt-decks">open-anki-jlpt-decks</a>, plus JMdict © EDRDG (CC BY-SA 4.0) via jmdict-simplified.<br>
          Phrases: <a href="#" data-link="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR). Readings are generated with kuromoji.js.<br>
          Stroke order: <a href="#" data-link="https://kanjivg.tagaini.net">KanjiVG</a> © Ulrich Apel (CC BY-SA 3.0).
        </div>
      </div></div>`;
    $('#theme').value = s.theme;
    const set = (k, v) => { s[k] = v; SRS.save(); updateNav(); };
    $('#batch').onchange = (e) => set('batchSize', Math.min(30, Math.max(1, +e.target.value || 5)));
    $('#maxl').onchange = (e) => set('maxLessonsPerDay', Math.max(0, +e.target.value || 0));
    $('#theme').onchange = (e) => { set('theme', e.target.value); applyTheme(); };
    $('#autoplay').onchange = (e) => set('autoplayAudio', e.target.checked);
    if ($('#voice')) {
      $('#voice').onchange = (e) => set('voice', e.target.value);
      $('#test-voice').onclick = () => Speech.speak('こんにちは。日本語を勉強しましょう。');
    }
    if ($('#speech-settings')) $('#speech-settings').onclick = () => window.api.openSpeechSettings();
    $('#open-folder').onclick = () => window.api.openDataFolder();
    $('#export').onclick = async () => { if (await window.api.exportProgress(SRS.state)) toast('Progress exported'); };
    $('#import').onclick = async () => {
      let data;
      try { data = await window.api.importProgress(); } catch (e) { toast('Could not read that file'); return; }
      if (!data) return;
      if (!data.items || !data.settings) { toast("That doesn't look like a progress file"); return; }
      if (!confirm('Replace your current progress with the imported file?')) return;
      SRS.setState(data);
      applyTheme();
      toast('Progress imported');
      go('dashboard');
    };
    $('#reset').onclick = () => {
      if (!confirm('Reset ALL progress and start from level 1?')) return;
      if (!confirm('Are you sure? This cannot be undone (daily backups are still in the data folder).')) return;
      const fresh = SRS.newState();
      fresh.notes = SRS.state.notes;
      fresh.synonyms = SRS.state.synonyms;
      fresh.settings = SRS.state.settings;
      SRS.setState(fresh);
      toast('Progress reset');
      go('dashboard');
    };
    $$('[data-link]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.api.openLink(a.dataset.link); }));
  }

  const VIEWS = { dashboard: viewDashboard, lessons: viewLessons, reviews: viewReviews, browse: viewBrowse, settings: viewSettings };

  // ------------------------------------------------------------------ boot
  (async () => {
    await SRS.init();
    applyTheme();
    Speech.init();
    go('dashboard');
    setInterval(updateNav, 60e3);
  })();

  void isJapanese;
})();
