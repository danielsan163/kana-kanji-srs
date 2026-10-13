// Original kana mnemonics. **bold** marks the sound to remember.
// Basic kana are written by hand; dakuten, combination and extended kana are generated from their parts.
const BASIC = {
  // ---------------------------------------------------------------- hiragana
  'あ': 'A gymnast spinning around a cross-shaped bar, yelling "**Ah**h!"',
  'い': 'Two short strokes side by side, like the two i\'s in "**ii**" (いい, "good").',
  'う': 'A sideways **U** wearing a little cap.',
  'え': 'A dancer: dash for a head, then a zig-zag leg kicking out. "**Eh**!"',
  'お': 'Looks like あ with an extra flick flying off the top right. "**Oh**! Something flew off!"',
  'か': 'A **ka**rate chop: a blade-shaped stroke with a spark flicking off beside it.',
  'き': 'An old-fashioned **key**: two teeth on a stem.',
  'く': 'A cuckoo\'s open beak: "**ku**-**ku**!"',
  'け': 'A **ke**g: the post on the left is the barrel, the right side is its tap.',
  'こ': 'Two **co**ins lying side by side.',
  'さ': 'A crossbar on a post resting on a curved seat: a **sa**ddle.',
  'し': 'A **she**pherd\'s hook.',
  'す': 'A rope **swi**ng with a knot tied in the middle.',
  'せ': 'A crossbar on two legs, the right leg bent: a **se**t of shelves bolted to a wall.',
  'そ': 'Thread zig-zagging down a seam: **sew**.',
  'た': 'The left half is a **t**, the right half looks like an **a**, so "t + a" = **ta**.',
  'ち': 'A **chai**n hanging in a hook from a beam.',
  'つ': 'One big curling wave: a **tsu**nami.',
  'て': 'An arm reaching out with an open hand. て sounds like 手 (**te**, "hand").',
  'と': 'A small slant bumping into a curve: a stubbed **toe**.',
  'な': 'A fork (the cross) beside a knotted **na**pkin.',
  'に': 'The post is a leg, the two short dashes are a **knee**pad.',
  'ぬ': '**Noo**dles twisted around chopsticks, with a curl at the end.',
  'ね': 'A cat (**ne**ko) sitting, tail curled up behind it.',
  'の': 'One swirl with a slash through it: a "**No** entry" sign.',
  'は': 'Looks like an **H** and an **a** squeezed together.',
  'ひ': 'A wide grin, giggling "**hee**-**hee**".',
  'ふ': 'Someone leaning over a bowl, blowing on hot soup: "**fuu**…"',
  'へ': 'A tiny hill you **hea**ve yourself over.',
  'ほ': 'Like は with an extra bar on top: a **ho**use with its roof beam.',
  'ま': '**Ma**\'s apron: two crossbars with the strings tied in a loop.',
  'み': 'Looks like the number 21: "**me** at 21".',
  'む': 'A cow\'s head with a horn sticking out right: "**moo**".',
  'め': 'An eye with a lash. め sounds like 目 (**me**, "eye").',
  'も': 'A fishing hook with two bars, catching **mo**re fish.',
  'や': 'A **ya**cht: a curved sail, a mast and a little flag.',
  'ゆ': 'A round **yu**rt with its centre pole sticking up through it.',
  'よ': 'A **yo**-yo dangling from a stick.',
  'ら': 'A **ra**bbit: one ear sticking up, round body below.',
  'り': 'Two **ree**ds swaying by a **ri**ver.',
  'る': 'A road zig-zagging into a loop at the end, like a **ru**by ring on a chain.',
  'れ': 'Like ね, but the tail kicks out instead of curling. The cat **le**aves.',
  'ろ': 'Like る without the loop: a **ro**ad with one sharp bend.',
  'わ': 'Like ね, but the tail is a big round arch: a **wa**ll\'s archway.',
  'を': 'Someone tripping over a hook: "**Whoa**!"',
  'ん': 'Looks like a cursive lowercase **n**.',
  // ---------------------------------------------------------------- katakana
  'ア': 'An **a**xe.',
  'イ': 'An **ea**sel leaning against the wall.',
  'ウ': 'Like う with a wider hat: a **U** dressed up.',
  'エ': 'An I-beam inside an **e**levator shaft.',
  'オ': 'お\'s frame with the swirl gone: "**Oh**, it fell off!"',
  'カ': 'か without the spark: the **ka**rate chop on its own.',
  'キ': 'The same **key** as き, with a straight stem.',
  'ク': 'The cuckoo\'s beak (**ku**-**ku**) with a feather on top.',
  'ケ': 'A lowercase **k** leaning back.',
  'コ': 'The **co**rner of a box.',
  'サ': 'Two poles through a crossbar: a **sa**ndwich-board sign.',
  'シ': '**She** looks up and to the right: two tear-drops and a cheek line rising from the bottom left. (Compare ツ, whose strokes fall from the top.)',
  'ス': 'A stick figure sprinting: **su**per fast.',
  'セ': 'せ simplified: one bar, one hooked leg. Still the **se**t of shelves.',
  'ソ': 'A needle **sew**ing straight down: two strokes both falling from the top. (Compare ン, whose last stroke sweeps up.)',
  'タ': 'ク with a dash inside: a **ta**co with filling.',
  'チ': 'A **chee**rleader holding her baton up high.',
  'ツ': 'Three strokes crashing down from the top: a **tsu**nami. (Compare シ, whose strokes rise from the left.)',
  'テ': 'A **te**lephone pole with its crossbars.',
  'ト': 'A **to**tem pole with one arm.',
  'ナ': 'A cross with one leg bent: a crooked **na**il.',
  'ニ': 'Two lines = 二, the number 2 (**ni**).',
  'ヌ': 'Chopsticks crossing over a bowl of **noo**dles.',
  'ネ': 'A person with a **ne**cktie flapping in the wind.',
  'ノ': 'One slash: "**No**!"',
  'ハ': 'An open mouth laughing: "**Ha**!"',
  'ヒ': 'The **hee**l of a boot.',
  'フ': 'The top of ふ: a **hoo**d.',
  'ヘ': 'The same tiny hill as へ, still **hea**ving.',
  'ホ': 'A scarecrow with arms out and legs splayed: "**Ho**, ho!"',
  'マ': 'An arm bent to show off a muscle: **ma**cho.',
  'ミ': 'Three lines for three: **mi**ttsu (三つ).',
  'ム': 'A cow\'s face, nose pointing down: "**moo**".',
  'メ': 'An X crossing out a **me**mo.',
  'モ': 'Like も, fishing for **mo**re with straight bars.',
  'ヤ': 'や without its flag: the bare **ya**cht mast.',
  'ユ': 'A **U**-shaped bench sitting on the floor.',
  'ヨ': 'A **yo**ga mat folded into three.',
  'ラ': 'The **ra**bbit\'s ear (the dash) over a hood.',
  'リ': 'The same **ri**ver reeds as り.',
  'ル': 'Two legs, the right one kicking back mid-stride: **ru**nning.',
  'レ': 'One **le**g kicking forward.',
  'ロ': 'A small square **ro**om.',
  'ワ': 'ウ without its top dash: a **wa**ter faucet.',
  'ヲ': 'Like フ with an extra rung: "**Whoa**, it grew a step!"',
  'ン': 'Like ソ, but the second stroke sweeps up from the bottom like a lowercase **n**. (Compare ソ, which falls down.)',
};

const SMALL = { 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo', 'ァ': 'a', 'ィ': 'i', 'ゥ': 'u', 'ェ': 'e', 'ォ': 'o' };

/** romajiOf(char) → main romaji of a basic kana */
function mnemonicFor(c, romaji, romajiOf) {
  if (BASIC[c]) return BASIC[c];
  if (c === 'ー') return 'The long-vowel bar: hold the previous vowel for an extra beat, as in コーヒー (**kōhī**, coffee). Type it with "-".';
  const chars = [...c];
  if (chars.length === 1) {
    const [base, mark] = [...c.normalize('NFD')];
    const br = romajiOf(base);
    if (mark === '゙') {
      if (base === 'ウ') return 'ウ (u) with the two buzzing ticks (゛): **vu**, used for the "v" sound in foreign words.';
      const note = base === 'ち' || base === 'チ' || base === 'つ' || base === 'ツ'
        ? ' It sounds the same as the more common ' + (romaji === 'ji' ? 'じ/ジ' : 'ず/ズ') + ', so you will rarely see it.' : '';
      return `${base} (${br}) plus the two little ticks (゛), which make the sound buzzier: ${br} → **${romaji}**.${note}`;
    }
    if (mark === '゚') return `${base} (${br}) plus the little circle (゜), a bubble that goes **p**op: ${br} → **${romaji}**.`;
  }
  if (chars.length === 2 && SMALL[chars[1]]) {
    const first = romajiOf(chars[0]) || romajiOf(chars[0].normalize('NFD')[0]);
    if (/[ァィゥェォ]/.test(chars[1])) {
      return `${chars[0]} (${first}) + a small ${chars[1]} (${SMALL[chars[1]]}) make **${romaji}**. Katakana uses small vowels like this to spell sounds that Japanese doesn't have, mostly in foreign words.`;
    }
    return `${chars[0]} (${first}) + a small ${chars[1]} (${SMALL[chars[1]]}) glue together into one beat: **${romaji}**.`;
  }
  return '';
}

module.exports = { mnemonicFor };
