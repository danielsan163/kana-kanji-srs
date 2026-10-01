// Test helper: KKS_SHOT=steps.json runs JS steps in the window and saves screenshots.
// steps.json: { "out": "dir", "steps": [ { "js": "...", "wait": 300, "shot": "name" }, { "keys": ["a","Enter"] } ] }
const fs = require('fs');
const path = require('path');
module.exports = function (win, stepsFile) {
  const { out, steps } = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[console]', msg); });
  win.webContents.once('did-finish-load', async () => {
    await sleep(800);
    for (const st of steps) {
      try {
        if (st.js) { const r = await win.webContents.executeJavaScript(st.js); if (st.log) console.log(st.log, JSON.stringify(r)); }
        if (st.type) win.webContents.insertText(st.type);
        for (const k of st.keys || []) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k });
          if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k });
          await sleep(60);
        }
        await sleep(st.wait || 300);
        if (st.shot) {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(out, st.shot + '.png'), img.toPNG());
        }
      } catch (e) { console.log('step error', e.message); }
    }
    win.close();
  });
};
