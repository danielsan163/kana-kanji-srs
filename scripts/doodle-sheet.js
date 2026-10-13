// Renders a review sheet of kana doodles to a PNG: npx electron scripts/doodle-sheet.js <kana> <out.png> [light|dark]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { DOODLES, CAPTIONS } = require('./kana-doodles');

const [kana, out, theme = 'light'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RAW = path.join(__dirname, '..', 'raw', 'kanjivg', 'kanji');
const strokes = (ch) => {
  const f = path.join(RAW, ch.codePointAt(0).toString(16).padStart(5, '0') + '.svg');
  return [...fs.readFileSync(f, 'utf8').matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
};
const COLS = 8, CELL = 170;
const chars = [...kana];
const dark = theme === 'dark';
const cells = chars.map((ch) => `<div class="cell"><svg viewBox="-6 -8 121 122">
  ${strokes(ch).map((d) => `<path class="k" d="${d}"/>`).join('')}${(DOODLES[ch] || []).join('')}</svg><div class="lbl">${ch} <span class="cap">${CAPTIONS[ch] || ''}</span></div></div>`).join('');
const html = `<html><head><meta charset="utf-8"><style>
body{margin:0;padding:10px;background:${dark ? '#1f1f29' : '#fff'};font-family:'Segoe UI','Yu Gothic UI';display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:6px}
.cell{border:1px solid ${dark ? '#33333f' : '#ddd'};border-radius:10px;height:${CELL + 18}px;position:relative}
svg{width:${CELL}px;height:${CELL}px;overflow:visible}
.k{fill:none;stroke:${dark ? '#ff6ab8' : '#d4006f'};stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
.d{fill:none;stroke:${dark ? '#a9a9b8' : '#55556a'};stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.df{fill:${dark ? '#a9a9b8' : '#55556a'}}
.dt{fill:${dark ? '#a9a9b8' : '#55556a'};font-size:9px;font-style:italic}
.dt.big{font-size:16px;font-style:normal;font-weight:600}
.cap{font-size:11px;opacity:.75}
.lbl{position:absolute;bottom:2px;left:8px;right:4px;white-space:nowrap;overflow:hidden;font-size:13px;color:${dark ? '#ececf1' : '#222'}}
</style></head><body>${cells}</body></html>`;
app.whenReady().then(async () => {
  const rows = Math.ceil(chars.length / COLS);
  const w = COLS * (CELL + 6) + 20, h = rows * (CELL + 24) + 20;
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(out, img.toPNG());
  app.quit();
});
