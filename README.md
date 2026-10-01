# Kana Kanji SRS

A WaniKani/Bunpro-style spaced-repetition app for Windows. It covers hiragana, katakana, the ~2,200 JLPT kanji (N5 → N1), about 5,000 vocabulary words and about 240 beginner-friendly phrases.

## Install / run

- **Install:** download `Kana-Kanji-SRS-Setup-1.0.0.exe` from the [Releases page](https://github.com/danielsan163/kana-kanji-srs/releases), or build it yourself with `npm run dist` (output in `dist\`). It adds desktop and Start Menu shortcuts.
  - Windows SmartScreen may warn because the app isn't code-signed. Choose **More info → Run anyway**.
- **Run from source:** `npm start`

## How it works

- **Levels 1–3:** hiragana, katakana, and combinations.
- **Levels 4–113:** about 20 kanji each, in JLPT order and by frequency.
- **Level up:** the next level unlocks when 90% of the current level's kana/kanji reach **Guru**.
  - You can also press **Unlock level N now** on the dashboard at any time.
- **Vocab and phrases:** unlock once all of their kanji are at Guru.
- **SRS stages:** Apprentice 1–4 (4h, 8h, 1d, 2d), then Guru 1–2 (1w, 2w), Master (1mo), Enlightened (4mo), and Burned.
  - A wrong answer drops the item 1 stage, or 2 if it's at Guru or above.
- **Prompts:**
  - **Kana:** reading in romaji.
  - **Kanji:** meaning, on'yomi (katakana) and kun'yomi (hiragana). Any valid reading of the requested type counts.
  - **Vocab:** meaning and reading.
  - **Phrases:** type the reading in kana, then self-check the meaning.
- **Reference examples (not reviewed):** shown on lesson pages, in Item info and in item details.
  - **Vocab:** up to 5 short, easy example sentences, each with an English translation, the word highlighted and furigana you can toggle.
  - **Kanji:** the 5 most common words containing it, ranked by how often they appear in Tatoeba, each with reading and meaning.
- **Typing:** readings auto-convert from romaji as you type. Type `nn` or `n'` for ん, and `-` for ー.

### Keyboard

| Key | Action |
|---|---|
| Enter | Submit / next |
| F | Item info (after answering) |
| Backspace | "I made a typo", retry the question (after a wrong answer) |
| 1 / 2 | Phrase self-check: understood / missed |
| ← / → | Move between lesson items |

## Audio

Audio uses Windows text-to-speech, so it needs a Japanese voice.

1. Open Settings → Time & language → Language & region → Add a language → Japanese, and tick **Text-to-speech**.
2. Restart the app.

## Your data

Progress is saved to `%APPDATA%\KanaKanjiSRS\progress.json`. The app also makes a daily backup in `backups\` and keeps the last 14. You can export and import it from Settings.

## Rebuilding the content

The raw sources live in `raw/` and are not included in the installer.

- `npm run build-data` regenerates `app/data/data.js`, `app/data/strokes.json` and `app/data/examples.json`.
- Tuning knobs are at the top of `scripts/build-data.js`: kanji per level, vocab per kanji, and maximum phrase length.

Note: this resets content only. Progress is keyed by the item's text, so it survives a rebuild.

## Development

- `npm test`: answer-grading checks.
- `npm run dist`: build the installer into `dist/`.
- `npx electron scripts/make-icon.js`: regenerate the icon.
- `KKS_USERDATA=<dir> KKS_SHOT=<steps.json> npx electron .`: scripted screenshot run for UI testing (see `scripts/shot-driver.js`).

## Credits & licenses

The app's source code is licensed under the [GNU GPL v3](LICENSE). The bundled data in `app/data/` is derived from the sources below and stays under their own licenses.

| Content | Source | License |
|---|---|---|
| Kanji | KANJIDIC2 © EDRDG, via [kanji-data](https://github.com/davidluzgouveia/kanji-data) | CC BY-SA 4.0 |
| Vocabulary | JLPT lists by Jonathan Waller, via [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) | CC BY |
| Vocabulary (extra glosses) | JMdict © EDRDG, via jmdict-simplified | CC BY-SA 4.0 |
| Phrases | [Tatoeba](https://tatoeba.org) | CC BY 2.0 FR |
| Stroke order | [KanjiVG](https://kanjivg.tagaini.net) © Ulrich Apel | CC BY-SA 3.0 |

Phrase readings are generated with kuromoji.js.

## Building from source

1. Install Node.js, then run `npm install`.
   - If npm blocked install scripts and Electron is missing, run `node node_modules/electron/install.js`.
2. Run `npm start`.

The generated data in `app/data/` is already committed. If you want to regenerate it, download the raw sources into `raw/` first:
- `kanji.json` from kanji-data
- `n1.csv`–`n5.csv` from open-anki-jlpt-decks
- the jmdict-eng-common JSON from jmdict-simplified
- the Tatoeba `jpn_sentences.tsv`, `eng_sentences.tsv` and `jpn-eng_links.tsv`
- the KanjiVG `kanji/` folder in `raw/kanjivg/`

Then run `npm run build-data`.
