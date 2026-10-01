// Renders build/icon.png (512x512) with Electron: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">
    <div style="width:512px;height:512px;border-radius:110px;background:linear-gradient(135deg,#f0158f,#a8005d);display:grid;place-items:center">
    <span style="font-family:'Yu Gothic UI','Yu Gothic','Meiryo';font-weight:700;font-size:360px;color:#fff;line-height:1;margin-top:-20px">字</span></div></body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  app.quit();
});
