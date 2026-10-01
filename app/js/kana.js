// Romaji → kana conversion (as-you-type IME) and kana helpers
(function () {
  const T = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
    ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ', ye: 'いぇ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
    wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', fyu: 'ふゅ',
    sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
    cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
    ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
    jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
    thi: 'てぃ', dhi: 'でぃ', twu: 'とぅ', dwu: 'どぅ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', xwa: 'ゎ',
    lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', ltu: 'っ', ltsu: 'っ',
    '-': 'ー', ',': '、', '.': '。', '?': '？', '!': '！',
  };
  // y-combos: kya, sya, cya, tya, nya, hya, mya, rya, gya, zya, dya, bya, pya
  const Y_BASE = { k: 'き', s: 'し', c: 'ち', t: 'ち', n: 'に', h: 'ひ', m: 'み', r: 'り', g: 'ぎ', z: 'じ', d: 'ぢ', b: 'び', p: 'ぴ', l: 'り' };
  for (const [c, k] of Object.entries(Y_BASE)) {
    T[c + 'ya'] = k + 'ゃ'; T[c + 'yu'] = k + 'ゅ'; T[c + 'yo'] = k + 'ょ';
    T[c + 'ye'] = k + 'ぇ'; T[c + 'yi'] = k + 'ぃ';
  }
  const KEYS = Object.keys(T);
  const VOWELS = 'aeiou';
  const MAXLEN = 4;

  function hiraToKata(s) { return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); }
  function kataToHira(s) { return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)); }

  /**
   * Convert romaji in `input` to kana. Existing kana are kept.
   * final=false leaves an unfinished tail (e.g. "k", "sh", a lone "n") as romaji so typing can continue.
   */
  function toKana(input, { katakana = false, final = false } = {}) {
    const s = input.toLowerCase();
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const next = s[i + 1];
      if (!/[a-z\-,.?!']/.test(ch)) { out += ch; i++; continue; }
      if (ch === 'n') {
        if (next === undefined) { out += final ? 'ん' : 'n'; i++; continue; }
        if (next === "'") { out += 'ん'; i += 2; continue; }
        if (next === 'n') {
          const after = s[i + 2];
          // "nn" + vowel/y → ん + n-row (konnichiha); otherwise "nn" → ん
          if (after !== undefined && (VOWELS.includes(after) || after === 'y')) { out += 'ん'; i += 1; }
          else { out += 'ん'; i += 2; }
          continue;
        }
        if (!VOWELS.includes(next) && next !== 'y') { out += 'ん'; i++; continue; }
      }
      // double consonant → small tsu
      if (next === ch && /[bcdfghjklmpqrstvwxyz]/.test(ch)) { out += 'っ'; i++; continue; }
      if (ch === 't' && next === 'c' && s[i + 2] === 'h') { out += 'っ'; i++; continue; }
      let matched = false;
      for (let len = MAXLEN; len >= 1; len--) {
        const chunk = s.substr(i, len);
        if (chunk.length === len && T[chunk] !== undefined) { out += T[chunk]; i += len; matched = true; break; }
      }
      if (matched) continue;
      if (ch === "'") { i++; continue; }
      // Could still become a valid syllable → keep the romaji tail as-is
      const tail = s.slice(i);
      if (!final && KEYS.some((k) => k.startsWith(tail))) { out += tail; break; }
      out += ch; i++;
    }
    return katakana ? hiraToKata(out) : out;
  }

  // Replace ー with the vowel kana of the preceding mora so こーひー ≈ こおひい
  const VOWEL_OF = {};
  const rows = {
    'あ': 'あかさたなはまやらわがざだばぱぁゃゎ', 'い': 'いきしちにひみりぎじぢびぴぃ',
    'う': 'うくすつぬふむゆるぐずづぶぷぅゅゔ', 'え': 'えけせてねへめれげぜでべぺぇ', 'お': 'おこそとのほもよろをごぞどぼぽぉょ',
  };
  for (const [v, chars] of Object.entries(rows)) for (const c of chars) VOWEL_OF[c] = v;
  function expandChoon(s) {
    let out = '';
    for (const ch of s) {
      if (ch === 'ー' && out.length) out += VOWEL_OF[out[out.length - 1]] || 'ー';
      else out += ch;
    }
    return out;
  }
  // Canonical kana form for comparison: hiragana, no punctuation/spaces, ー expanded
  function normKana(s) {
    return expandChoon(kataToHira(s).replace(/[\s。、！？!?,.・「」『』~〜～]/g, ''));
  }
  const isJapanese = (s) => /[぀-ヿ一-鿿]/.test(s);
  const isKanaOnly = (s) => /^[぀-ヿー]+$/.test(s);

  window.Kana = { toKana, hiraToKata, kataToHira, normKana, expandChoon, isJapanese, isKanaOnly };
})();
