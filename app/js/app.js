// UI: routing, dashboard, lessons, reviews, browse, item details, settings
(function () {
  const { toKana, kataToHira, isJapanese } = window.Kana;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const view = $('#view');
  const isWeb = window.api.platform === 'web';
  const isIOS = /iPhone|iPad/.test(navigator.userAgent);
  const TYPE_LABEL = { kana: 'Kana', kanji: 'Kanji', vocab: 'Vocabulary', sentence: 'Phrase' };

  // ------------------------------------------------------------------ routing & keys
  let current = { name: null, cleanup: null };
  let keyHandler = null;
  function go(name, arg) {
    closeModal(true);
    if (name === 'dashboard') dashLevel = null;
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

  // Themes: each has a base mode (dark/light palette underneath) and optional typography
  const THEMES = [
    { id: 'dark', name: 'Dark', mode: 'dark' },
    { id: 'light', name: 'Light', mode: 'light' },
    { id: 'system', name: isWeb ? 'Match system' : 'Match Windows', sub: 'Dark or light' },
    { id: 'shinji', name: 'Shinji', sub: 'Eva Unit-01', mode: 'dark', eva: true },
    { id: 'asuka', name: 'Asuka', sub: 'Eva Unit-02', mode: 'dark', eva: true },
    { id: 'rei', name: 'Rei', sub: 'Eva Unit-00', mode: 'light', eva: true },
    { id: 'nes', name: 'NES', sub: 'Pixel font', mode: 'dark', retro: true },
    { id: 'snes', name: 'SNES', sub: 'Pixel font', mode: 'light', retro: true },
    { id: 'sfc', name: 'SFC', sub: 'Super Famicom', mode: 'light', retro: true },
  ];
  const themeById = (id) => THEMES.find((t) => t.id === id && t.mode) || THEMES[0];
  function applyTheme() {
    const s = SRS.state.settings;
    const id = s.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.theme;
    const t = themeById(id);
    const root = document.documentElement.dataset;
    root.theme = t.id;
    root.mode = t.mode;
    root.pixel = t.retro && s.pixelFont !== false ? 'on' : 'off';
    root.eva = t.eva ? 'on' : 'off';
    root.jpfont = s.jpFont;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
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
    const stageCls = opts.byStage && s >= 0 ? 'by-stage st-' + SRS.stageGroup(s) : '';
    const cls = ['tile', 't-' + it.t, s < 0 ? 'locked' : '', stageCls, opts.small ? 'small' : '', [...it.c].length > 2 ? 'wide' : ''].join(' ');
    const bar = s > 0 ? `<span class="stage-bar"><i style="width:${(s / 9) * 100}%"></i></span>` : '';
    return `<button class="${cls}" data-item="${esc(it.id)}" title="${esc(shortMeaning(it))} — ${s < 0 ? 'Locked' : SRS.STAGE_NAMES[s]}">${label}${bar}</button>`;
  }
  const stageLegend = () => `<div class="stage-legend">${[['lesson', 'Not started'], ['apprentice', 'Apprentice'], ['guru', 'Guru'], ['master', 'Master'], ['enlightened', 'Enlightened'], ['burned', 'Burned']]
    .map(([k, l]) => `<span><i class="sw st-${k}"></i>${l}</span>`).join('')}<span><i class="sw locked"></i>Locked</span></div>`;

  /** Minimal Markdown for the bundled changelog: ## version, ### section, nested "- " bullets, **bold**, `code`. */
  function changelogHTML(md) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const versions = [];
    let cur = null, depth = -1;
    const closeLists = (to) => { while (depth > to) { cur.html += '</li></ul>'; depth--; } };
    for (const line of md.split(/\r?\n/)) {
      const v = line.match(/^## (.+)/);
      if (v) { if (cur) closeLists(-1); cur = { title: v[1], html: '' }; versions.push(cur); depth = -1; continue; }
      if (!cur || /^# /.test(line)) continue;
      const h = line.match(/^### (.+)/);
      const li = line.match(/^(\s*)- (.+)/);
      if (h) { closeLists(-1); cur.html += `<h4>${inline(h[1])}</h4>`; }
      else if (li) {
        const d = Math.floor(li[1].length / 2);
        if (d > depth) { cur.html += '<ul><li>'; depth++; while (depth < d) { cur.html += '<ul><li>'; depth++; } }
        else { closeLists(d); cur.html += '</li><li>'; }
        cur.html += inline(li[2]);
      } else if (line.trim()) { closeLists(-1); cur.html += `<p>${inline(line)}</p>`; }
    }
    if (cur) closeLists(-1);
    return versions.map((x, i) => `<details class="changelog-version" ${i === 0 ? 'open' : ''}><summary>${inline(x.title)}</summary>${x.html}</details>`).join('');
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
      <div class="faint" style="font-size:12px">${paths.length} stroke${paths.length === 1 ? '' : 's'} · click to replay</div>`;
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

  // Mnemonic doodle: the real kana strokes with the drawing around them (doodle markup is our own bundled data)
  async function drawDoodle(box, it) {
    const paths = await window.api.getStrokes(it.c);
    if (!box.isConnected) return;
    box.innerHTML = `<svg viewBox="-6 -8 121 122">${(paths || []).map((d) => `<path class="k" d="${d}"/>`).join('')}${it.dd}</svg>`;
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
      if (it.dd) side.push(`<div class="doodle-box" title="Mnemonic doodle"><div class="doodle-svg">Loading…</div><div class="doodle-cap">${esc(it.dc || '')}</div></div>`);
      if ([...it.c].length === 1 && it.c !== 'ー') side.push(`<div class="stroke-box" id="stroke-box" style="margin-top:12px">Loading…</div>`);
    } else if (it.t === 'kanji') {
      main.push(`<dl class="kv"><dt>Meaning</dt><dd><span class="primary-meaning">${esc(it.meanings[0])}</span>
          ${it.meanings.length > 1 ? `<div class="muted">${esc(it.meanings.slice(1).join(', '))}</div>` : ''}</dd>
        <dt>On'yomi</dt><dd class="readings">${it.on.length ? esc(it.on.join('、')) : '<span class="faint">none</span>'}</dd>
        <dt>Kun'yomi</dt><dd class="readings">${it.kun.length ? it.kun.map(kunHTML).join('、') : '<span class="faint">none</span>'}</dd>
        <dt>Audio</dt><dd>${audioBtn(SRS.speechText(it))}</dd>
        ${it.parts && it.parts.length ? `<dt>Parts</dt><dd class="parts">${it.parts.map(([el, m]) => {
          const k = SRS.byId.get('k:' + el);
          return `<span class="part ${k ? '' : 'ref'}" ${k ? `data-item="${esc(k.id)}"` : ''}><span class="jp">${esc(el)}</span>${m ? `<small>${esc(m)}</small>` : ''}</span>`;
        }).join('<span class="plus">+</span>')}</dd>` : ''}
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
      if (ks.length) main.push(`<h3>Kanji</h3><div class="list-rows">${ks.map(rowFor).join('')}</div>`);
      main.push(`<h3 class="row" style="justify-content:space-between">Example sentences
          <button class="btn small furi-toggle" title="Show or hide readings above kanji">Furigana: ${SRS.state.settings.exampleFurigana ? 'on' : 'off'}</button></h3>
        <div class="ex-box"><span class="faint">Loading…</span></div>`);
      const ss = sentencesWithVocab(it);
      if (ss.length) main.push(`<h3>Phrases you'll study</h3><div class="list-rows">${ss.map(rowFor).join('')}</div>`);
    } else if (it.t === 'sentence') {
      main.push(`<div class="jp" style="font-size:30px;line-height:2">${sentenceHTML(it, true)} ${audioBtn(SRS.speechText(it))}</div>
        <div class="translation">${esc(it.en)}</div>
        <div class="muted jp" style="margin-top:6px">${esc(SRS.sentenceReading(it))}</div>`);
      const vs = vocabInSentence(it);
      if (vs.length) main.push(`<h3>Words</h3><div class="list-rows">${vs.map(rowFor).join('')}</div>`);
      const ks = it.kanji.map((k) => SRS.byId.get('k:' + k)).filter(Boolean);
      main.push(`<h3>Kanji</h3><div class="tiles">${ks.map((k) => tile(k, { small: true })).join('')}</div>
        <div class="faint" style="font-size:12px;margin-top:10px">Sentence from Tatoeba (#${esc(it.id.slice(2))}). Readings are machine-generated and may occasionally be off.</div>`);
    }

    // built-in mnemonic; your own notes come first once you've written some
    const mnHTML = it.mn ? `<h3>Mnemonic</h3><div class="mnemonic">${esc(it.mn).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>` : '';
    const hasNotes = !!(SRS.state.notes[it.id] || '').trim();
    if (!hasNotes) main.push(mnHTML);
    // notes & synonyms
    main.push(`<h3>Your mnemonic / notes</h3><textarea class="notes" placeholder="Write a mnemonic or anything that helps you remember…">${esc(SRS.state.notes[it.id] || '')}</textarea>`);
    if (hasNotes) main.push(mnHTML.replace('<h3>Mnemonic</h3>', '<h3>Built-in mnemonic</h3>'));
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
        ${p && p.mk ? '<div class="faint" style="margin-top:4px;font-size:12px">Marked as already known</div>' : ''}
        <div class="row" style="margin-top:10px">
          ${p && p.s < SRS.GURU ? `<button class="btn small" id="mark-known" title="Send it straight to Guru I. You'll get a check-up review in a week.">Mark as known</button>` : ''}
          ${p && p.s >= 1 ? `<button class="btn small" id="reset-item">Reset to lesson</button>` : ''}</div></div>`);
    }

    container.innerHTML = `<div class="detail-grid"><div>${main.join('')}</div><div>${side.join('')}</div></div>`;
    if ($('#stroke-box', container)) drawStrokes($('#stroke-box', container), it.c);
    if (it.dd) drawDoodle($('.doodle-svg', container), it);
    if (it.t === 'kanji' || it.t === 'vocab') loadExamples(container, it);

    const notes = $('.notes', container);
    let nt;
    notes.addEventListener('input', () => {
      clearTimeout(nt);
      nt = setTimeout(() => {
        SRS.setNote(it.id, notes.value);
      }, 300);
    });
    notes.addEventListener('keydown', (e) => e.stopPropagation());
    const synIn = $('.syn-input', container);
    if (synIn) {
      synIn.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && synIn.value.trim()) {
          SRS.setSynonyms(it.id, [...(SRS.state.synonyms[it.id] || []), synIn.value.trim()]);
          renderDetail(container, it, opts);
          $('.syn-input', container).focus();
        }
      });
      $$('[data-del-syn]', container).forEach((b) => b.addEventListener('click', () => {
        SRS.setSynonyms(it.id, SRS.state.synonyms[it.id].filter((_, i) => i !== +b.dataset.delSyn));
        renderDetail(container, it, opts);
      }));
    }
    const mk = $('#mark-known', container);
    if (mk) mk.addEventListener('click', () => {
      SRS.markKnown(it.id);
      toast(`${it.c} marked as known (Guru I)`);
      renderDetail(container, it, opts);
      updateNav();
    });
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
        return `<div class="ex-sentence"><div class="ex-jp jp">${html} ${audioBtn(SRS.spokenText(ex.tokens))}</div><div class="ex-en">${esc(ex.en)}</div></div>`;
      }).join('') + '<div class="faint" style="font-size:12px">Sentences from Tatoeba · readings are machine-generated</div>'
        : '<span class="faint">No example sentences found for this word.</span>';
    };
    render();
    const btn = $('.furi-toggle', container);
    if (btn) btn.onclick = () => {
      SRS.setSetting('exampleFurigana', !SRS.state.settings.exampleFurigana);
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
  /** Small in-app dialog with custom buttons. Resolves with the chosen button's value (null on Esc/close). */
  function choose(title, html, buttons) {
    return new Promise((resolve) => {
      $('#modal-card').innerHTML = `<button class="modal-close" title="Close (Esc)">✕</button><h2>${esc(title)}</h2>
        <div class="muted" style="line-height:1.6">${html}</div>
        <div class="row" style="margin-top:18px;justify-content:flex-end">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-choice="${i}">${esc(b.label)}</button>`).join('')}</div>`;
      $('#modal').classList.remove('hidden');
      const done = (v) => { obs.disconnect(); closeModal(true); resolve(v); };
      const obs = new MutationObserver(() => { if ($('#modal').classList.contains('hidden')) { obs.disconnect(); resolve(null); } });
      obs.observe($('#modal'), { attributes: true });
      $('.modal-close').onclick = () => done(null);
      $$('[data-choice]').forEach((b) => b.addEventListener('click', () => done(buttons[+b.dataset.choice].value)));
    });
  }

  function closeModal(navigating) {
    const m = $('#modal');
    if (m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    $('#modal-card').innerHTML = '';
    if (!navigating && ['dashboard', 'browse', 'practice'].includes(current.name) && !$('.quiz')) VIEWS[current.name].refresh?.();
    updateNav();
  }
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

  // ------------------------------------------------------------------ dashboard
  let dashLevel = null; // level shown on the dashboard's level card (null = current level)
  let historyAll = false;
  function viewDashboard() {
    const st = SRS.state;
    const shown = Math.min(Math.max(1, dashLevel || st.level), st.level);
    const isCurrent = shown === st.level;
    const lessons = SRS.lessonQueue();
    const lessonsAvail = Math.min(lessons.length, SRS.lessonsLeftToday());
    const reviews = SRS.reviewQueue().length;
    const next = SRS.nextReviewAt();
    const lp = SRS.levelProgress(shown);
    const lvl = SRS.levels[shown - 1];
    const counts = SRS.stageCounts();
    const fc = SRS.forecast(24);
    const fc7 = SRS.forecast(24 * 7);
    const maxBar = Math.max(1, ...fc.buckets);
    const today = SRS.dayStats();
    const gating = SRS.byLevel.get(shown).filter((it) => it.t === 'kana' || it.t === 'kanji');
    const others = SRS.byLevel.get(shown).filter((it) => it.t === 'vocab' || it.t === 'sentence');
    const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtWhen = (ts) => `${new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} (${relTime(ts)})`;
    const estimate = isCurrent ? SRS.levelUpEstimate() : null;
    const history = Object.keys(st.levelLog).map(Number).sort((a, b) => b - a).map((n) => {
      const start = st.levelLog[n], end = st.levelLog[n + 1] || null;
      const days = ((end || Date.now()) - start) / 86400e3;
      const dur = days < 1 ? `${Math.max(1, Math.round(days * 24))} h` : `${days.toFixed(days < 10 ? 1 : 0)} days`;
      return `<tr><td><b>${n}</b></td><td>${esc(SRS.levels[n - 1].name)}</td><td>${fmtDate(start)}</td>
        <td>${end ? dur : `${dur} so far`}</td><td>${st.levelForced[n] ? '<span class="faint">unlocked early</span>' : ''}</td></tr>`;
    });
    const leveledUpAt = !isCurrent && st.levelLog[shown + 1];
    const levelStatus = isCurrent
      ? `${lp.guru} / ${lp.total} ${lvl.kind === 'kana' ? 'kana' : 'kanji'} at Guru · ${lp.needed} needed to level up`
      : `${lp.guru} / ${lp.total} ${lvl.kind === 'kana' ? 'kana' : 'kanji'} at Guru${leveledUpAt ? ` · moved on to level ${shown + 1} on ${fmtDate(leveledUpAt)}` : ''}`;
    let cumulative = reviews;

    const bars = fc.buckets.map((n, i) => {
      cumulative += n;
      const t = new Date(fc.start + i * 3600e3);
      const label = t.toLocaleTimeString([], { hour: 'numeric' });
      return `<div class="bar-slot" tabindex="0"><div class="tip">${label}: ${n} new · ${cumulative} total</div><div class="bar" style="height:${(n / maxBar) * 100}%"></div></div>`;
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
          <div class="sub">${st.vacation ? 'Paused (vacation mode)' : lessonsAvail ? 'New items ready to learn' : lessons.length ? 'Daily lesson limit reached' : 'No new lessons. Level up to unlock more'}</div></button>
        <button class="big-action reviews" id="go-reviews" ${reviews ? '' : 'disabled'}>
          <div class="label">Reviews</div><div class="count">${reviews}</div>
          <div class="sub">${st.vacation ? 'Paused (vacation mode)' : reviews ? 'Ready now' : next ? `Next review ${relTime(next)}` : 'Finish some lessons first'}</div></button>
      </div>
      ${st.vacation ? `<div class="card vacation-banner" style="margin-top:16px"><div>🏖️ <b>Vacation mode is on</b> since ${new Date(st.vacation.since).toLocaleDateString([], { month: 'short', day: 'numeric' })}.
        Reviews and lessons are paused, and nothing piles up while you're away.</div><button class="btn primary" id="end-vacation">End vacation</button></div>` : ''}
      ${!Speech.available ? `<div class="card" style="margin-top:16px;border-color:var(--sentence)">🔈 No Japanese text-to-speech voice found, so audio is off. <a href="#" id="voice-help">How to install it</a></div>` : ''}
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="level-head">
            <button class="level-arrow" id="lvl-prev" title="Previous level (←)" aria-label="Previous level" ${shown <= 1 ? 'disabled' : ''}>‹</button>
            <h2>Level ${lvl.n} <span class="muted" style="font-weight:500">· ${esc(lvl.name)}</span>
              ${isCurrent ? '<span class="stage-chip sg-guru" style="vertical-align:middle">Current</span>' : ''}</h2>
            <span class="spacer"></span>
            ${!isCurrent ? '<button class="btn small" id="lvl-current">Back to current</button>' : ''}
            <button class="level-arrow" id="lvl-next" title="Next level (→)" aria-label="Next level" ${isCurrent ? 'disabled' : ''}>›</button>
          </div>
          <div class="muted" style="margin-bottom:8px">${levelStatus}</div>
          ${isCurrent && estimate ? `<div class="level-estimate">🎯 Earliest level-up: <b>${fmtWhen(estimate)}</b> <span class="faint">if you get every review right</span></div>` : ''}
          <div class="progress"><div style="width:${(lp.guru / lp.total) * 100}%"></div><span class="goal" style="left:90%"></span></div>
          <h3>${lvl.kind === 'kana' ? 'Kana' : 'Kanji'}</h3><div class="tiles">${gating.map((it) => tile(it, { byStage: true })).join('')}</div>
          ${others.length ? `<h3>Vocabulary & phrases</h3><div class="tiles">${others.map((it) => tile(it, { small: true, byStage: true })).join('')}</div>` : ''}
          ${stageLegend()}
          <div class="row" style="margin-top:16px">
            ${isCurrent && st.level < SRS.MAX_LEVEL ? `<button class="btn" id="force-level">Unlock level ${st.level + 1} now</button>
            <span class="faint" style="font-size:12px">For material you already know. Items still go through lessons.</span>` : ''}
          </div>
        </div>
        <div class="card">
          <h2>Upcoming reviews</h2>
          <div class="muted" style="font-size:13px">Next 24 hours, by hour · ${matchMedia('(hover: none)').matches ? 'tap' : 'hover'} a bar for totals</div>
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
        <h2>Level history</h2>
        <div class="table-wrap"><table class="leech-table history-table"><thead><tr><th>Level</th><th>Name</th><th>Reached</th><th>Time on level</th><th></th></tr></thead>
          <tbody>${history.slice(0, historyAll ? history.length : 6).join('')}</tbody></table></div>
        ${history.length > 6 ? `<button class="btn small" id="history-toggle" style="margin-top:10px">${historyAll ? 'Show fewer' : `Show all ${history.length}`}</button>` : ''}
      </div>
      <div class="card" style="margin-top:16px">
        <h2>SRS stages</h2>
        <div class="stat-tiles">
          ${[['apprentice', 'Apprentice'], ['guru', 'Guru'], ['master', 'Master'], ['enlightened', 'Enlightened'], ['burned', 'Burned']]
            .map(([k, l]) => `<div class="stat-tile" style="--c:var(--st-${k})"><div class="n">${counts[k]}</div><div class="l">${l}</div></div>`).join('')}
        </div>
      </div>
    </div>`;
    const showLevel = (n) => { dashLevel = Math.min(Math.max(1, n), st.level); viewDashboard.refresh(); };
    if ($('#history-toggle')) $('#history-toggle').onclick = () => { historyAll = !historyAll; viewDashboard.refresh(); };
    if ($('#end-vacation')) $('#end-vacation').onclick = () => { SRS.endVacation(); toast('Welcome back! Your reviews pick up where you left off.'); viewDashboard.refresh(); updateNav(); };
    $('#lvl-prev').onclick = () => showLevel(shown - 1);
    $('#lvl-next').onclick = () => showLevel(shown + 1);
    if ($('#lvl-current')) $('#lvl-current').onclick = () => showLevel(st.level);
    keyHandler = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && shown > 1) showLevel(shown - 1);
      if (e.key === 'ArrowRight' && !isCurrent) showLevel(shown + 1);
    };
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
          <button class="btn" id="known" title="Skip this lesson and send the item straight to Guru I. You'll get a check-up review in a week.">I already know this <span class="kbd">K</span></button>
          ${i < batch.length - 1 ? '<button class="btn primary" id="next">Next <span class="kbd">Enter</span></button>'
            : '<button class="btn primary" id="quiz">Start quiz <span class="kbd">Enter</span></button>'}
        </div></div>`;
      renderDetail($('#lesson-detail'), it, { hideSrs: true });
      $$('.lesson-strip .tile').forEach((t) => t.addEventListener('click', () => { i = +t.dataset.j; show(); }));
      $('#prev').onclick = prev;
      $('#known').onclick = markKnown;
      if ($('#next')) $('#next').onclick = next;
      if ($('#quiz')) $('#quiz').onclick = startQuiz;
      if (SRS.state.settings.autoplayAudio && Speech.available && it.t !== 'kanji') Speech.speak(SRS.speechText(it));
    }
    const next = () => { if (i < batch.length - 1) { i++; show(); } else startQuiz(); };
    const prev = () => { if (i > 0) { i--; show(); } };
    function markKnown() {
      const it = batch[i];
      SRS.markKnown(it.id);
      toast(`${it.c} marked as known (Guru I)`);
      batch.splice(i, 1);
      [...seen].forEach((j) => { if (j >= i) seen.delete(j); });
      updateNav();
      if (!batch.length) { go('lessons'); return; }
      if (i >= batch.length) i = batch.length - 1;
      show();
    }
    keyHandler = (e) => {
      if (e.target.matches('textarea, input')) return;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'k' || e.key === 'K') markKnown();
    };
    function startQuiz() {
      runQuiz({
        items: batch,
        mode: 'lesson',
        title: 'Lesson quiz',
        onItemDone: (it) => SRS.completeLesson(it),
        onFinish: () => {
          const more = Math.min(SRS.lessonQueue().length, SRS.lessonsLeftToday());
          const due = SRS.reviewQueue().length;
          keyHandler = (e) => {
            const k = e.key.toLowerCase();
            if (k === 'enter') { e.preventDefault(); go(more ? 'lessons' : 'dashboard'); }
            else if (k === 'd') go('dashboard');
            else if (k === 'r' && due) go('reviews');
          };
          view.innerHTML = `<div class="page"><div class="card" style="text-align:center;padding:40px">
            <h1>Lessons complete 🎉</h1><p class="muted">${batch.length} items moved to Apprentice. First review in about 4 hours.</p>
            <div class="tiles" style="justify-content:center;margin:16px 0">${batch.map((b) => tile(b)).join('')}</div>
            <div class="row" style="justify-content:center">
              ${more ? `<button class="btn primary" data-go="lessons">More lessons (${more}) <span class="kbd">Enter</span></button>` : ''}
              ${due ? `<button class="btn" data-go="reviews">Reviews (${due}) <span class="kbd">R</span></button>` : ''}
              <button class="btn ${more ? '' : 'primary'}" data-go="dashboard">Dashboard <span class="kbd">${more ? 'D' : 'Enter'}</span></button></div></div></div>`;
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
    const order = mode === 'lesson' ? 'random' : SRS.state.settings.reviewOrder;
    const TYPE_RANK = { kana: 0, kanji: 1, vocab: 2, sentence: 3 };
    const pending = shuffle(items.slice());
    if (order === 'lowerFirst') pending.sort((a, b) => a.lvl - b.lvl);           // stable: random within a level
    else if (order === 'typeFirst') pending.sort((a, b) => TYPE_RANK[a.t] - TYPE_RANK[b.t]);
    const backToBack = mode !== 'lesson' && SRS.state.settings.backToBack;
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
      // Back-to-back: finish the remaining questions of the item you just answered before moving on
      const same = backToBack && active.find((x) => x.it.id === lastItemId);
      let pool = active.length > 1 ? active.filter((x) => x.it.id !== lastItemId) : active;
      const st = same || pool[Math.floor(Math.random() * pool.length)];
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
          ${mode !== 'lesson' ? `<button class="btn small" id="wrap" ${wrapUp ? 'disabled' : ''}>${wrapUp ? `Wrapping up (${active.length})` : 'Wrap up'}</button>` : ''}
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
        : `<div class="answer-row"><input class="answer" id="answer" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${prompt === 'meaning' ? 'Your answer' : prompt === 'on' ? '答え (katakana)' : it.t === 'kana' ? 'romaji' : '答え'}">
          <button class="answer-submit" id="submit" title="Submit (Enter)">➜</button></div>`}
        <div class="quiz-msg" id="msg">${esc(message)}</div>
        <div class="quiz-actions" id="actions"></div>
        <div class="card info-panel hidden" id="info"></div>
      </div>`;
      $('#exit').onclick = () => {
        if (mode === 'review' && done.length < total && !confirm('Exit reviews? Items you finished are saved; unfinished ones stay in your queue.')) return;
        go(mode === 'practice' ? 'practice' : 'dashboard');
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
        if (onItemDone) onItemDone(st.it);
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
      const practice = mode === 'practice';
      const lessonsLeft = SRS.lessonQueue().length;
      const due = SRS.reviewQueue().length;
      const practiseMissed = () => startPractice(wrongs.map((d) => d.it), 'Practice: missed items');
      keyHandler = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'enter') { e.preventDefault(); go(practice ? 'practice' : 'dashboard'); }
        else if (k === ' ' && wrongs.length) { e.preventDefault(); practiseMissed(); }
        else if (k === 'd') go('dashboard');
        else if (k === 'l' && lessonsLeft) go('lessons');
        else if (k === 'r' && due) go('reviews');
      };
      view.innerHTML = `<div class="page"><div class="card" style="padding:28px">
        <h1>${practice ? 'Practice summary' : 'Review summary'}</h1>
        <p class="muted">${done.length} items ${practice ? 'practised' : 'reviewed'} · ${done.length ? Math.round((right.length / done.length) * 100) : 0}% correct
        ${unlockedAll.length ? ` · <b>${unlockedAll.length} new items unlocked</b>` : ''}${practice ? ' · Practice doesn&#39;t change your SRS stages' : ''}</p>
        <h3>Correct (${right.length})</h3><div class="summary-list">${right.map((d) => tile(d.it, { small: true, byStage: !practice })).join('') || '<span class="faint">—</span>'}</div>
        <h3>Needs work (${wrongs.length})</h3><div class="summary-list">${wrongs.map((d) => tile(d.it, { small: true, byStage: !practice })).join('') || '<span class="faint">—</span>'}</div>
        <div class="row" style="margin-top:22px">
          ${practice ? '<button class="btn primary" data-go="practice">Back to practice <span class="kbd">Enter</span></button>'
            : '<button class="btn primary" data-go="dashboard">Dashboard <span class="kbd">Enter</span></button>'}
          ${wrongs.length ? `<button class="btn" id="practice-wrongs">Practise the ${wrongs.length} I missed <span class="kbd">Space</span></button>` : ''}
          ${practice ? '<button class="btn" data-go="dashboard">Dashboard <span class="kbd">D</span></button>' : ''}
          ${lessonsLeft ? '<button class="btn" data-go="lessons">Lessons <span class="kbd">L</span></button>' : ''}
          ${due ? `<button class="btn" data-go="reviews">More reviews (${due}) <span class="kbd">R</span></button>` : ''}
        </div></div></div>`;
      const pw = $('#practice-wrongs');
      if (pw) pw.onclick = practiseMissed;
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

  // ------------------------------------------------------------------ practice (extra study + leeches, no SRS effect)
  function startPractice(list, title) {
    if (!list.length) return;
    if (current.cleanup) current.cleanup();
    current = { name: 'practice', cleanup: null };
    $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.go === 'practice'));
    runQuiz({ items: list, mode: 'practice', title });
  }
  function relTimePast(ts) {
    const d = Date.now() - ts;
    const m = Math.round(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(d / 3600e3);
    if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
    return `${Math.round(d / 86400e3)} days ago`;
  }
  function viewPractice() {
    const sets = SRS.practiceSets();
    const leeches = SRS.leeches();
    const card = (key, name, desc) => {
      const list = sets[key];
      return `<div class="card practice-card"><h2>${name} <span class="muted" style="font-weight:500">(${list.length})</span></h2>
        <div class="muted" style="font-size:13px">${desc}</div>
        <div class="tiles" style="margin:12px 0">${list.slice(0, 18).map((it) => tile(it, { small: true })).join('')}${list.length > 18 ? `<span class="faint" style="align-self:center">+${list.length - 18} more</span>` : ''}</div>
        <button class="btn primary" data-practice="${key}" ${list.length ? '' : 'disabled'}>Practise${list.length ? ' ' + list.length : ''}</button></div>`;
    };
    view.innerHTML = `<div class="page">
      <h1>Practice</h1>
      <p class="muted" style="margin-top:-8px">Extra study with the same typed questions as reviews. Nothing here changes your SRS stages or review schedule.</p>
      <div class="grid cols-2">
        ${card('recentMistakes', 'Recent mistakes', 'Items you got wrong in a review in the last 24 hours.')}
        ${card('recentLessons', 'Recent lessons', 'Items you learned in the last 48 hours.')}
        ${card('currentLevel', `Current level (${SRS.state.level})`, 'Everything you have started from your current level.')}
        ${card('leeches', 'Leeches', 'Items you keep getting wrong. See the full list below.')}
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Leech list</h2>
        <div class="muted" style="font-size:13px;margin-bottom:12px">An item becomes a leech after 2 or more wrong reviews that it hasn't recovered from with correct answers in a row.
          Score = wrong reviews ÷ (current correct streak + 1)<sup>1.5</sup>. Try writing your own mnemonic in the item's notes, or reset it to a lesson.</div>
        ${leeches.length ? `<div class="table-wrap"><table class="leech-table"><thead><tr><th>Item</th><th>Meaning</th><th>Stage</th><th>Wrong</th><th>Correct</th><th>Streak</th><th>Last wrong</th><th>Score</th></tr></thead><tbody>
          ${leeches.map(({ it, p, score }) => `<tr data-item="${esc(it.id)}"><td>${tile(it, { small: true })}</td><td>${esc(shortMeaning(it))}</td><td>${stageChip(it)}</td>
            <td>${p.w}</td><td>${p.c}</td><td>${p.k || 0}</td><td>${p.lw ? relTimePast(p.lw) : '—'}</td><td><b>${score.toFixed(1)}</b></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="faint">No leeches yet. Nice!</div>'}
      </div></div>`;
    const TITLES = { recentMistakes: 'Practice: recent mistakes', recentLessons: 'Practice: recent lessons', currentLevel: 'Practice: current level', leeches: 'Practice: leeches' };
    $$('[data-practice]').forEach((b) => b.addEventListener('click', () => startPractice(sets[b.dataset.practice], TITLES[b.dataset.practice])));
  }
  viewPractice.refresh = () => viewPractice();

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
        return `<h3>${name} (${g.length})</h3><div class="tiles">${g.map((it) => tile(it, { small: t === 'vocab', byStage: true })).join('')}</div>`;
      };
      body.innerHTML = `<div class="grid browse-grid">
        <div class="card"><h2>Levels</h2><div class="level-grid">${cells}</div></div>
        <div class="card"><h2>Level ${lvl.n} · ${esc(lvl.name)} ${lvl.n > st.level ? '<span class="stage-chip sg-locked">Locked</span>' : ''}</h2>
          ${section('kana', 'Kana')}${section('kanji', 'Kanji')}${section('vocab', 'Vocabulary')}${section('sentence', 'Phrases')}
          ${stageLegend()}</div></div>`;
      $$('.level-cell', body).forEach((c) => c.addEventListener('click', () => { browseLevel = +c.dataset.level; renderBody(); }));
    }
    viewBrowse.refresh = renderBody;
    renderBody();
  }

  // ------------------------------------------------------------------ settings
  function viewSettings() {
    const s = SRS.state.settings;
    const notificationsCard = isWeb ? `
      <div class="card" style="margin-top:16px">
        <h2>Review alerts</h2>
        <div class="setting"><div><b>Notifications</b><div class="desc" id="push-desc">…</div></div>
          <button class="btn" id="push-toggle" disabled>Turn on</button></div>
      </div>` : `
      <div class="card" style="margin-top:16px">
        <h2>Notifications &amp; startup</h2>
        <div class="setting"><div><b>Review notifications</b><div class="desc">A Windows notification when new reviews are ready. Click it to jump straight in.</div></div>
          <input type="checkbox" id="notif" ${s.notifications ? 'checked' : ''}></div>
        <div class="setting"><div><b>Keep running in the tray when closed</b><div class="desc">Closing the window hides the app in the system tray so notifications keep working. Quit from the tray icon.</div></div>
          <input type="checkbox" id="tray" ${s.closeToTray ? 'checked' : ''}></div>
        <div class="setting"><div><b>Start with Windows</b><div class="desc">Starts quietly in the tray when you sign in.</div></div>
          <input type="checkbox" id="login" ${s.openAtLogin ? 'checked' : ''}></div>
      </div>`;
    const noVoiceHelp = isIOS
      ? 'iPhone Settings → Accessibility → Spoken Content → Voices → Japanese, then download a voice. Reopen this app afterwards.'
      : isWeb ? 'Install a Japanese text-to-speech voice in your system settings, then reload this page.'
        : `Windows Settings → Time &amp; language → Language &amp; region → Add a language → Japanese, and make sure <b>Text-to-speech</b> is ticked.
          Or open Speech settings → Manage voices → Add voices → Japanese. Restart this app afterwards.`;
    view.innerHTML = `<div class="page" style="max-width:800px">
      <h1>Settings</h1>
      <div class="card">
        <h2>Sync &amp; account</h2>
        <div id="sync-box"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Study</h2>
        <div class="setting"><div><b>Lesson batch size</b><div class="desc">How many new items per lesson session before the quiz.</div></div>
          <input type="number" id="batch" min="1" max="30" value="${s.batchSize}" style="width:80px"></div>
        <div class="setting"><div><b>Daily lesson limit</b><div class="desc">0 = unlimited. Keeps your review pile manageable.</div></div>
          <input type="number" id="maxl" min="0" max="500" value="${s.maxLessonsPerDay}" style="width:80px"></div>
        <div class="setting"><div><b>Review order</b><div class="desc">Which items come up first in reviews and practice.</div></div>
          <select id="rorder"><option value="random">Random</option><option value="lowerFirst">Lower levels first</option><option value="typeFirst">Kana &amp; kanji before vocab &amp; phrases</option></select></div>
        <div class="setting"><div><b>Back-to-back questions</b><div class="desc">Ask an item's meaning and reading one after the other instead of mixing them in randomly.</div></div>
          <input type="checkbox" id="b2b" ${s.backToBack ? 'checked' : ''}></div>
        <div class="setting"><div><b>Vacation mode</b><div class="desc">Pause reviews and lessons while you're away. When you come back, review times shift forward so nothing piles up.</div></div>
          <button class="btn ${SRS.state.vacation ? 'primary' : ''}" id="vacation">${SRS.state.vacation ? 'End vacation' : 'Start vacation'}</button></div>
      </div>
      ${notificationsCard}
      <div class="card" style="margin-top:16px">
        <h2>Appearance</h2>
        <div><b>Theme</b><div class="desc">Applies to this ${isWeb ? 'device' : 'PC'} only.</div></div>
        <div class="theme-grid" id="theme-grid">${THEMES.map((t) => {
          const look = t.mode ? `data-theme="${t.id}" data-mode="${t.mode}"` : '';
          return `<button class="theme-card ${t.mode ? '' : 'split'} ${s.theme === t.id ? 'selected' : ''}" data-pick-theme="${t.id}" ${look} aria-pressed="${s.theme === t.id}">
            <div class="tc-name" ${t.mode ? '' : 'style="color:#fff;mix-blend-mode:difference"'}>${esc(t.name)}</div><div class="tc-sub" ${t.mode ? '' : 'style="color:#999"'}>${esc(t.sub || (t.mode === 'dark' ? 'Default dark' : 'Default light'))}</div>
            ${t.mode ? `<div class="tc-row"><span class="tc-tile">字</span><span class="tc-btn">Reviews</span></div>
            <div class="tc-stages">${['apprentice', 'guru', 'master', 'enlightened', 'burned'].map((g) => `<i style="background:var(--st-${g})"></i>`).join('')}</div>` : ''}
          </button>`;
        }).join('')}</div>
        <div class="setting ${themeById(s.theme).retro ? '' : 'hidden'}" id="pixel-row"><div><b>Pixel fonts</b><div class="desc">Use the pixel font for headings and buttons in the NES, SNES and SFC themes.</div></div>
          <input type="checkbox" id="pixel" ${s.pixelFont !== false ? 'checked' : ''}></div>
        <div class="setting"><div><b>Japanese font</b><div class="desc">Textbook shows characters the way they're handwritten: ロ with its little overhang, さ and き with separate strokes</div></div>
          <select id="jpfont"><option value="print">Print</option><option value="textbook">Textbook (handwritten)</option></select></div>
        <div class="font-preview jp" id="font-preview">ロ 口 さ き り ふ や 字</div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Audio</h2>
        ${Speech.available ? `
        <div class="setting"><div><b>Japanese voice</b></div>
          <div class="row"><select id="voice">${Speech.voices.map((v) => `<option ${v.name === s.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
          <button class="btn small" id="test-voice">Test</button></div></div>` : `
        <div class="setting"><div><b>No Japanese voice installed</b><div class="desc">${noVoiceHelp}</div></div>
          ${isWeb ? '' : '<button class="btn" id="speech-settings">Open speech settings</button>'}</div>`}
        <div class="setting"><div><b>Autoplay audio</b><div class="desc">Play the reading after a correct reading answer and when a lesson opens.</div></div>
          <input type="checkbox" id="autoplay" ${s.autoplayAudio ? 'checked' : ''}></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Your data</h2>
        ${isWeb ? '' : `<div class="setting"><div><b>Progress folder</b><div class="desc">Saved automatically, with a backup each day (last 14 kept). Point this at a OneDrive or Dropbox folder to sync between PCs, but only have the app open on one PC at a time.
          <div class="data-path" id="data-path">…</div></div></div>
          <div class="row" style="flex-wrap:nowrap"><button class="btn" id="open-folder">Open</button><button class="btn" id="change-folder">Change…</button><button class="btn hidden" id="default-folder">Use default</button></div></div>`}
        <div class="setting"><div><b>Export / import</b><div class="desc">Save a copy of your progress to a file, or restore one.</div></div>
          <div class="row"><button class="btn" id="export">Export…</button><button class="btn" id="import">Import…</button></div></div>
        <div class="setting"><div><b>Reset all progress</b><div class="desc">Start over from level 1. Your notes are kept.</div></div>
          <button class="btn danger" id="reset">Reset…</button></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>What's new <span class="muted" style="font-weight:500" id="app-version"></span></h2>
        <div class="muted" style="font-size:13px;margin-bottom:10px">Every version, newest first. Click a version to expand or collapse it.</div>
        <div id="changelog" class="changelog"><span class="faint">Loading…</span></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Credits &amp; licenses</h2>
        <div class="muted" style="font-size:13px;line-height:1.7">
          Kanji data: KANJIDIC2 © EDRDG (CC BY-SA 4.0), via <a href="#" data-link="https://github.com/davidluzgouveia/kanji-data">kanji-data</a>, including JLPT levels from Jonathan Waller's lists.<br>
          Vocabulary: JLPT lists by Jonathan Waller (CC BY) via <a href="#" data-link="https://github.com/jamsinclair/open-anki-jlpt-decks">open-anki-jlpt-decks</a>, plus JMdict © EDRDG (CC BY-SA 4.0) via jmdict-simplified.<br>
          Phrases: <a href="#" data-link="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR). Readings are generated with kuromoji.js.<br>
          Stroke order: <a href="#" data-link="https://kanjivg.tagaini.net">KanjiVG</a> © Ulrich Apel (CC BY-SA 3.0).
          <br>Pixel font: <a href="#" data-link="https://github.com/codeman38/PressStart2P">Press Start 2P</a> © The Press Start 2P Project Authors (SIL OFL 1.1).
          ${isWeb ? '<br>Textbook font: <a href="#" data-link="https://github.com/fontworks-fonts/Klee">Klee One</a> © The Klee Project Authors (SIL OFL 1.1).' : ''}
        </div>
      </div></div>`;
    $('#jpfont').value = s.jpFont;
    const set = (k, v) => { SRS.setSetting(k, v); updateNav(); };
    renderSyncBox();
    renderPushSetting();
    $('#batch').onchange = (e) => set('batchSize', Math.min(30, Math.max(1, +e.target.value || 5)));
    $('#maxl').onchange = (e) => set('maxLessonsPerDay', Math.max(0, +e.target.value || 0));
    $$('[data-pick-theme]').forEach((b) => b.addEventListener('click', () => {
      set('theme', b.dataset.pickTheme);
      applyTheme();
      $$('[data-pick-theme]').forEach((x) => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', x === b); });
      $('#pixel-row').classList.toggle('hidden', !themeById(b.dataset.pickTheme).retro);
    }));
    $('#pixel').onchange = (e) => { set('pixelFont', e.target.checked); applyTheme(); };
    $('#jpfont').onchange = (e) => { set('jpFont', e.target.value); applyTheme(); };
    $('#autoplay').onchange = (e) => set('autoplayAudio', e.target.checked);
    window.api.about().then(({ version, changelog }) => {
      if (!$('#changelog')) return; // left Settings meanwhile
      $('#app-version').textContent = `· version ${version}`;
      $('#changelog').innerHTML = changelog ? changelogHTML(changelog) : '<span class="faint">No changelog available.</span>';
    });
    $('#rorder').value = s.reviewOrder;
    $('#rorder').onchange = (e) => set('reviewOrder', e.target.value);
    $('#b2b').onchange = (e) => set('backToBack', e.target.checked);
    $('#vacation').onclick = () => {
      if (SRS.state.vacation) { SRS.endVacation(); toast('Vacation over. Welcome back!'); }
      else { SRS.startVacation(); toast('Vacation mode on. Reviews are paused.'); }
      updateNav();
      viewSettings();
    };
    const setPref = (k, v) => { set(k, v); pushAppPrefs(); };
    if (!isWeb) {
      $('#notif').onchange = (e) => setPref('notifications', e.target.checked);
      $('#tray').onchange = (e) => setPref('closeToTray', e.target.checked);
      $('#login').onchange = (e) => setPref('openAtLogin', e.target.checked);
    }
    const showDir = async () => {
      if (isWeb) return;
      const d = await window.api.getDataDir();
      if (!$('#data-path')) return; // left Settings meanwhile
      $('#data-path').textContent = d.path + (d.isDefault ? '  (default)' : '');
      $('#default-folder').classList.toggle('hidden', d.isDefault);
    };
    showDir();
    const moveTo = async (useDefault) => {
      const pick = await window.api.chooseDataDir(useDefault);
      if (!pick) return;
      if (pick.error) { toast(pick.error); return; }
      if (pick.same) { toast("That's already your progress folder"); return; }
      let mode = 'move';
      if (pick.existing) {
        const when = new Date(pick.existing.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        mode = await choose('That folder already has progress',
          `It holds a save at <b>level ${pick.existing.level}</b>, last saved ${esc(when)}.<br>Use that save, or replace it with the progress you have open now (level ${SRS.state.level})?`,
          [{ label: 'Cancel', value: null }, { label: 'Replace it with mine', value: 'move' }, { label: 'Use that save', value: 'use', primary: true }]);
        if (!mode) return;
      }
      SRS.flush();
      const res = await window.api.applyDataDir(pick.path, mode, SRS.state);
      if (mode === 'use' && res) { SRS.setState(res); applyTheme(); }
      toast(mode === 'use' ? 'Loaded the progress from that folder' : 'Progress moved');
      go('settings');
    };
    if (!isWeb) {
      $('#change-folder').onclick = () => moveTo(false);
      $('#default-folder').onclick = () => moveTo(true);
      $('#open-folder').onclick = () => window.api.openDataFolder();
    }
    if ($('#voice')) {
      $('#voice').onchange = (e) => set('voice', e.target.value);
      $('#test-voice').onclick = () => Speech.speak('こんにちは。日本語を勉強しましょう。');
    }
    if ($('#speech-settings')) $('#speech-settings').onclick = () => window.api.openSpeechSettings();
    $('#export').onclick = async () => { if (await window.api.exportProgress(SRS.state)) toast('Progress exported'); };
    $('#import').onclick = async () => {
      let data;
      try { data = await window.api.importProgress(); } catch (e) { toast('Could not read that file'); return; }
      if (!data) return;
      if (!data.items || !data.settings) { toast("That doesn't look like a progress file"); return; }
      if (!confirm(`Replace your current progress with the imported file?${Sync.signedIn ? ' Your other synced devices will switch to it too.' : ''}`)) return;
      SRS.setState(data);
      applyTheme();
      toast('Progress imported');
      go('dashboard');
    };
    $('#reset').onclick = () => {
      if (!confirm(`Reset ALL progress and start from level 1?${Sync.signedIn ? ' This resets your other synced devices too.' : ''}`)) return;
      if (!confirm(isWeb ? 'Are you sure? This cannot be undone. Export a copy first if you might want it back.'
        : 'Are you sure? This cannot be undone (daily backups are still in the data folder).')) return;
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

  // ------------------------------------------------------------------ sync & alerts (Settings)
  function syncLine() {
    const st = Sync.status;
    if (st.state === 'syncing') return 'Syncing…';
    if (st.state === 'offline') return "Offline. It'll sync when you're back online.";
    if (st.state === 'error') return `Couldn't sync: ${st.error}`;
    return st.lastSync ? `Last synced ${relTimePast(st.lastSync)}` : 'Not synced yet';
  }
  function friendlyAuthError(e) {
    if (e.status === 429 || /rate limit/i.test(e.message)) return 'Too many attempts. Wait a few minutes and try again.';
    if (/not confirmed/i.test(e.message)) return 'Confirm your email first: click the link in the email Supabase sent, then sign in here.';
    if (/invalid login|invalid credentials/i.test(e.message)) return 'Wrong email or password.';
    if (/already registered|already exists/i.test(e.message)) return 'That email already has an account. Use Sign in instead.';
    if (/signups not allowed/i.test(e.message)) return 'New accounts are turned off. Use Sign in.';
    if (!navigator.onLine) return "You're offline.";
    return e.message;
  }
  function renderSyncBox() {
    const box = $('#sync-box');
    if (!box) return;
    if (Sync.signedIn) {
      box.dataset.mode = 'in';
      box.innerHTML = `<div class="setting"><div><b>Signed in as ${esc(Sync.email)}</b><div class="desc" id="sync-line">${esc(syncLine())}</div></div>
        <div class="row" style="flex-wrap:nowrap"><button class="btn" id="sync-now">Sync now</button><button class="btn" id="sync-out">Sign out</button></div></div>`;
      $('#sync-now').onclick = () => Sync.syncNow();
      $('#sync-out').onclick = async () => {
        if (!confirm('Sign out? Your progress stays on this device but stops syncing.')) return;
        await Sync.signOut();
        renderSyncBox();
        renderPushSetting();
      };
      return;
    }
    box.dataset.mode = 'out';
    box.innerHTML = `<div class="desc">Sign in to sync your progress between ${isWeb ? 'this phone and your PC' : 'this PC and your iPhone'}.
        First time? Enter your email and a password, then <b>Create account</b>.</div>
      <form class="sync-form" id="sync-form" autocomplete="on">
        <input class="text-input" id="sync-email" name="email" type="email" autocomplete="username" autocapitalize="none" placeholder="Email">
        <input class="text-input" id="sync-pass" name="password" type="password" autocomplete="current-password" placeholder="Password">
        <div class="row"><button class="btn primary" id="sync-in" type="submit">Sign in</button><button class="btn" id="sync-new" type="button">Create account</button></div>
      </form>
      <div class="desc sync-msg" id="sync-msg">${esc(Sync.status.error || '')}</div>`;
    const msg = (t) => { const m = $('#sync-msg'); if (m) m.textContent = t; };
    const email = $('#sync-email'), pass = $('#sync-pass');
    [email, pass].forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
    const read = () => {
      const v = { email: email.value.trim(), password: pass.value };
      if (!/^\S+@\S+\.\S+$/.test(v.email)) { msg('Enter your email address.'); return null; }
      if (v.password.length < 8) { msg('Passwords need at least 8 characters.'); return null; }
      return v;
    };
    const busy = (on) => { $('#sync-in').disabled = on; $('#sync-new').disabled = on; };
    $('#sync-form').onsubmit = async (e) => {
      e.preventDefault();
      const v = read();
      if (!v) return;
      busy(true);
      msg('Signing in…');
      try { await Sync.signIn(v.email, v.password); toast('Signed in. Your progress is syncing.'); renderSyncBox(); renderPushSetting(); }
      catch (err) { msg(friendlyAuthError(err)); busy(false); }
    };
    $('#sync-new').onclick = async () => {
      const v = read();
      if (!v) return;
      busy(true);
      msg('Creating your account…');
      try {
        if (await Sync.signUp(v.email, v.password)) { toast('Account created. Your progress is syncing.'); renderSyncBox(); renderPushSetting(); }
        else { msg('Account created. Check your email and click the confirmation link, then come back and press Sign in.'); busy(false); }
      } catch (err) { msg(friendlyAuthError(err)); busy(false); }
    };
  }
  function onSyncStatus() {
    const box = $('#sync-box');
    if (box) {
      if ((box.dataset.mode === 'in') !== Sync.signedIn) renderSyncBox();
      else if ($('#sync-line')) $('#sync-line').textContent = syncLine();
    }
  }
  async function renderPushSetting() {
    const btn = $('#push-toggle');
    if (!btn) return;
    const s = Sync.signedIn ? await Sync.pushStatus() : 'signed-out';
    if (!$('#push-toggle')) return;
    const QUIET = ' Quiet from 10 pm to 8 am.';
    $('#push-desc').textContent = {
      'signed-out': 'Sign in above first. Alerts are sent by the sync service.',
      'needs-install': 'Add this app to your Home Screen first: in Safari tap Share, then "Add to Home Screen". Open it from there and come back here.',
      unsupported: "This browser can't receive alerts.",
      denied: 'Notifications are blocked for this app. Allow them in iPhone Settings → Notifications → Kana Kanji.',
      off: 'Get a notification on this phone when new reviews are ready.' + QUIET,
      on: "On. You'll get a notification when new reviews are ready." + QUIET,
    }[s];
    btn.textContent = s === 'on' ? 'Turn off' : 'Turn on';
    btn.disabled = s !== 'on' && s !== 'off';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (s === 'on') { await Sync.disablePush(); toast('Review alerts off'); }
        else { await Sync.enablePush(); toast('Review alerts on'); }
      } catch (e) { toast(e.message, 5000); }
      renderPushSetting();
    };
  }

  function pushAppPrefs() {
    const s = SRS.state.settings;
    window.api.setAppPrefs({ notifications: s.notifications, closeToTray: s.closeToTray, openAtLogin: s.openAtLogin });
  }

  const VIEWS = { dashboard: viewDashboard, lessons: viewLessons, reviews: viewReviews, practice: viewPractice, browse: viewBrowse, settings: viewSettings };

  // ------------------------------------------------------------------ boot
  (async () => {
    await SRS.init();
    applyTheme();
    Speech.init();
    // Opened from a review alert (…/#reviews)
    const start = location.hash.slice(1);
    if (start) history.replaceState(null, '', location.pathname + location.search);
    go(VIEWS[start] ? start : 'dashboard');
    // Landed here from the account confirmation email
    if (/type=signup/.test(start)) toast('Email confirmed. Sign in under Settings → Sync & account.', 6000);
    else if (/error_description=/.test(start)) toast(decodeURIComponent(start.match(/error_description=([^&]*)/)[1].replace(/\+/g, ' ')), 6000);
    pushAppPrefs();
    window.api.onNavigate((name) => { if (VIEWS[name]) go(name); });

    Sync.onConflict = ({ local, remote }) => choose('Two sets of progress',
      `This ${isWeb ? 'device' : 'PC'} has progress up to <b>level ${local.level}</b>, and your account already has synced progress up to <b>level ${remote.level}</b>.
      Which should be kept? "Combine both" keeps the most recent answer for every item.`,
      [{ label: 'Cancel', value: null }, { label: 'Combine both', value: 'merge' },
        { label: `Keep this ${isWeb ? 'device' : 'PC'}'s`, value: 'device' }, { label: 'Keep synced', value: 'cloud', primary: true }]);
    Sync.onRemoteChange = () => {
      applyTheme();
      updateNav();
      if (!$('.quiz') && $('#modal').classList.contains('hidden') && VIEWS[current.name] && VIEWS[current.name].refresh) VIEWS[current.name].refresh();
    };
    Sync.subscribe(onSyncStatus);
    Sync.start();
    let lastReviews = 0;
    const tick = () => {
      updateNav();
      const n = SRS.reviewQueue().length;
      const lessons = Math.min(SRS.lessonQueue().length, SRS.lessonsLeftToday());
      window.api.setTrayInfo(SRS.state.vacation ? 'Kana Kanji SRS · vacation mode'
        : `Kana Kanji SRS · ${n} review${n === 1 ? '' : 's'}, ${lessons} lesson${lessons === 1 ? '' : 's'}`);
      // Notify when a new batch of reviews arrives (they land on the hour)
      if (n > lastReviews && n > 0) window.api.notify('Reviews ready', `${n} review${n === 1 ? ' is' : 's are'} waiting. Click to start.`);
      lastReviews = n;
    };
    tick();
    setInterval(tick, 60e3);
  })();

  void isJapanese;
})();
