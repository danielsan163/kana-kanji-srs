# Changelog

## 1.2.0 (unreleased)

### New
- **Themes** (Settings → Appearance). Pick from a grid of preview cards; each theme recolours the whole app, including item types and SRS stage colours. Themes are per device.
  - **Evangelion:** Shinji (Unit-01 purple and green), Asuka (Unit-02 red and orange) and Rei (Unit-00 blue and white, light). Headings use a heavy serif, like the show's title cards.
  - **Retro consoles:** NES (dark grey and red), SNES (light grey and purple) and SFC (Super Famicom grey with red, yellow, blue and green). Headings, buttons and tabs use the Press Start 2P pixel font, with a switch to turn it off. Japanese study text keeps your normal font.
  - Dark, Light and Match system are still there.

### Changed
- **The iPhone version's offline copy repairs itself** if something clears it, such as another site on the same github.io address.
- **Fixed (iPhone): the question card no longer slides under the camera island** when the keyboard opens. The app fits itself above the keyboard, with a slightly smaller card and the tab bar hidden while you type.
- **iPhone updates arrive reliably.** The app checks for a new version every time it comes to the front, not only on a fresh start, and always asks the server rather than a cached copy.
- **Check for updates** button in Settings → What's new (iPhone), with a Force update fallback that reloads the app fresh without touching your progress.

## 1.1.0 (October 12, 2026)

### New
- **iPhone version.** The whole app now also runs as a web app you add to your iPhone's Home Screen (Safari → Share → Add to Home Screen).
  - **Phone layout:** tab bar at the bottom, lesson buttons that stay in reach, item info full screen.
  - **Works offline** once it has loaded.
  - **Typing:** the English keyboard (romaji, converted as you type) or the Japanese kana keyboard both work, and iPhone's auto-capitalise and autocorrect are off in answer boxes.
  - **Audio** uses the iPhone's built-in Japanese voice. The **textbook font** setting uses Klee One, a similar free font, since iPhones don't have Windows' Kyokasho font.
- **Sync between PC and iPhone** (Settings → Sync & account). Create an account once with your email and a password, then sign in on each device.
  - **What syncs:** progress, notes, synonyms, daily counts and study settings. Theme, font, voice and Windows options stay per device.
  - **When:** on launch, shortly after you study, every couple of minutes while the app is open, and when you switch away from it.
  - **If both devices changed things,** each item keeps its most recent answer, so studying on both before they sync loses nothing.
  - **Reset and import** carry over to your other devices.
- **Review alerts on iPhone** (Settings → Review alerts): a notification when new reviews are ready, quiet from 10 pm to 8 am. The PC keeps its Windows notifications.
- **Kana mnemonics.** All 221 kana now come with a mnemonic:
  - **Basic hiragana and katakana:** a hand-written mnemonic for each.
  - **Dakuten (が), handakuten (ぱ), combinations (きゃ) and extended katakana (ファ, ヴ, ー):** the mnemonic explains how the parts combine.
  - **Look-alike pairs:** シ/ツ and ソ/ン note how to tell them apart.
  - **Where they show:** on the lesson page and in Item info. If you've written your own notes for an item, those come first and the built-in mnemonic moves below them.
- **Kana doodles.** All 92 basic hiragana and katakana have a mnemonic doodle with a short caption, shown beside the mnemonic on lesson pages and in Item info.
  - **How they're drawn:** the drawing is built around the kana's real strokes, so picturing the doodle brings back the shape.
  - **Look-alike pairs:** シ/ツ and ソ/ン get arrows showing which way the strokes go.
- **Kana stroke order.** Kana now have the same animated stroke-order diagram as kanji.
- **Practice tab** for extra study with the same typed questions as reviews. It never changes your SRS stages or review schedule. Sets you can practise:
  - **Recent mistakes:** items you got wrong in a review in the last 24 hours.
  - **Recent lessons:** items you learned in the last 48 hours.
  - **Current level:** everything you've started from your current level.
  - **Leeches:** items you keep getting wrong.
- **Leech list** on the Practice tab:
  - **What it shows:** each item's wrong and correct review counts, current correct streak, when you last missed it, and a leech score.
  - **How it ranks:** by the leech score, wrong reviews ÷ (streak + 1)^1.5.
  - **Details:** click any row to open the item.
- **"Practise the ones I missed" button** on the review summary, which starts a practice round right away.
- **Browse past levels on the dashboard.** The level card now has ‹ › arrows (or the ← → keys) to step back through earlier levels and check their progress, including the date you moved on from each one. "Back to current" returns to your current level.
- **Rank colours.** Tiles on the dashboard's level card and in Browse are coloured by SRS stage (Apprentice, Guru, Master, Enlightened, Burned, plus outlined for not started), with a legend. The review summary uses the same colours, so you can see what ranked up right away.
- **Version history in Settings.** A "What's new" section shows the app version and this full changelog, every version newest first.
- **More keyboard shortcuts on summary screens.**
  - **Review summary:** Enter for dashboard, Space to practise the ones you missed, L for lessons, R for more reviews.
  - **Practice summary:** Enter to go back to practice, D for dashboard.
  - **Lessons complete:** Enter for more lessons, R for reviews, D for dashboard.
- **Kana-only vocabulary.** 1,109 words written without kanji (これ, とても, ドア, コーヒー…) are mixed into levels 4+ in JLPT order, about 10 per level. They're quizzed on meaning only, since the reading is right there.
- **"I already know this."** Skip a lesson with the button (or **K**) and send the item straight to Guru I, with a check-up review a week later. Items you already study can be marked from their detail page too.
- **Level-up estimate** on the dashboard: the earliest time you can pass the current level if every review from now on is correct.
- **Level history** on the dashboard: when you reached each level, how long you spent on it, and which ones you unlocked early.
- **Vacation mode** (Settings): pauses reviews and lessons. When you end it, every review time shifts forward by the time you were away, so nothing piles up.
- **Kanji components.** Kanji pages show their parts with meanings, e.g. 河 = 氵 water + 可 possible. Parts that are kanji you study are clickable.
- **Review order options** (Settings): random, lower levels first, or kana and kanji before vocab and phrases. Also a back-to-back option that asks an item's meaning and reading one after the other.
- **Notifications and tray.**
  - **Notifications:** a Windows notification when new reviews arrive. Click it to start reviewing.
  - **Tray:** closing the window keeps the app running in the tray (quit from the tray icon).
  - **Start with Windows:** optional, starting quietly in the tray.
  - **Opening it twice:** brings up the window that's already open.
- **Choose your progress folder** (Settings), e.g. a OneDrive folder to sync between PCs. If the new folder already has a save, you choose which one to keep.

- **Japanese font setting** (Settings → Appearance). Choose **Print** (the default) or **Textbook (handwritten)**, which uses Windows' built-in UD Digital Kyokasho-tai to show characters the way they're written by hand: ロ with its little overhang, さ and き with separate strokes. There's a preview so you can compare them.

### Changed
- **Fixed:** a few vocab entries that listed two spellings ("川; 河") now use just the first.
- **Fixed:** audio for example sentences and phrases sometimes used the wrong reading (お父さん read as "ochichisan"). The voice now says the reading shown in the furigana.
- **Fixed:** 28 vocab words like 入学 and 準備 expected the reading with する on the end (にゅうがくする), so the plain reading was marked wrong. 伯父 (おじ) and 副 (ふく) also had wrong readings.
- **More readings accepted for vocab.** Words with more than one common reading accept all of them, e.g. 日本 (にほん / にっぽん), 明日 (あした / あす) and 開く (あく / ひらく). Single-kanji words don't, so 上 still wants うえ, not じょう.
- **Better example sentences.**
  - Words the furigana got wrong now use the right reading (明後日 is あさって, not みょうごにち; 一人 is ひとり).
  - Sentences that only contained the word's characters inside a longer word were removed (大家 "landlord" inside 大家族 "big family").
- **Phrase readings checked by hand.** 15 phrases had the wrong reading for a word and were corrected (住めば都 is すめばみやこ; 辛すぎる "too spicy" is からすぎる). Where a word can be read either way, both are accepted.
- **Review history is recorded in more detail.** Each item now remembers its current correct streak and when you last got it wrong. Items reviewed before this update start with a streak of 0.

## 1.0.0 (September 30, 2026)

First release.

### New
- **Content:** hiragana, katakana and kana combinations (levels 1–3), then 2,211 JLPT kanji from N5 to N1 across levels 4–113, about 20 per level.
- **Vocabulary and phrases:** about 5,000 vocabulary words (up to 5 per kanji) and 238 short phrases from Tatoeba. Each unlocks once all of its kanji reach Guru.
- **SRS:** WaniKani-style stages from Apprentice I to Burned, with the same intervals and penalties. A level unlocks when 90% of the previous level's kana/kanji reach Guru, and "Unlock level N now" lets you skip ahead.
- **Typed answers:**
  - **Readings:** romaji converts to kana as you type.
  - **Kanji:** separate meaning, on'yomi (katakana) and kun'yomi (hiragana) questions. Any valid reading of the requested type counts.
  - **Mistakes:** meanings are typo-tolerant, and giving the wrong reading type earns a "try again" shake instead of a miss.
  - **Phrases:** type the reading, then self-check the meaning.
- **"I made a typo" undo** after a wrong answer (Backspace).
- **Lessons** in batches with a quiz.
- **Item details:**
  - **Readings and strokes:** readings plus an animated stroke-order diagram.
  - **Audio:** Windows Japanese text-to-speech.
  - **Your additions:** personal notes, and your own synonyms accepted as answers.
  - **Examples:** up to 5 example sentences with English translations for each vocab word (furigana can be toggled), and the 5 most common words for each kanji.
- **Dashboard:** lesson and review counts, a 24-hour and 7-day review forecast, current level progress, SRS stage counts, today's stats and a day streak.
- **Browse and search** across every level, by kanji, word, meaning or reading.
- **Settings:** lesson batch size, daily lesson limit, dark/light/system theme, Japanese voice, autoplay audio, export/import, and reset.
- **Your data:** progress is saved automatically, with daily backups (last 14 kept).
