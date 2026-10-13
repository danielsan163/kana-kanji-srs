// Renders the app icons with Electron: npx electron scripts/make-icon.js
//   build/icon.png              512x512 rounded (Windows app + installer)
//   app/icons/icon-512.png      512x512 square (web app; phones round the corners themselves)
//   app/icons/icon-192.png      192x192 square
//   app/icons/apple-touch-icon.png  180x180 square (iPhone Home Screen)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = (radius) => `<html><body style="margin:0;background:transparent">
  <div style="width:512px;height:512px;border-radius:${radius}px;background:linear-gradient(135deg,#f0158f,#a8005d);display:grid;place-items:center">
  <span style="font-family:'Yu Gothic UI','Yu Gothic','Meiryo';font-weight:700;font-size:360px;color:#fff;line-height:1;margin-top:-20px">字</span></div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  async function render(radius) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html(radius)));
    await new Promise((r) => setTimeout(r, 500));
    return win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  }
  const root = path.join(__dirname, '..');
  const rounded = await render(110);
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), rounded.resize({ width: 512, height: 512 }).toPNG());
  const square = await render(0);
  const icons = path.join(root, 'app', 'icons');
  fs.mkdirSync(icons, { recursive: true });
  for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    fs.writeFileSync(path.join(icons, name), square.resize({ width: size, height: size, quality: 'best' }).toPNG());
  }
  app.quit();
});
