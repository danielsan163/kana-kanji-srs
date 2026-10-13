const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('KanaKanjiSRS');
app.setPath('userData', process.env.KKS_USERDATA || path.join(app.getPath('appData'), 'KanaKanjiSRS'));
app.setAppUserModelId('local.kanakanjisrs.app'); // matches build.appId so Windows notifications show the app name

const TEST_RUN = !!process.env.KKS_SHOT; // scripted screenshot runs: no tray, no single-instance lock
const START_HIDDEN = process.argv.includes('--hidden'); // launched at Windows sign-in

// ---------------------------------------------------------------- data folder
// The progress folder defaults to %APPDATA%\KanaKanjiSRS but can be moved (e.g. into OneDrive).
// Only its location is stored in config.json in the default folder.
const defaultDir = () => app.getPath('userData');
const configFile = () => path.join(defaultDir(), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; }
}
function writeConfig(patch) {
  const cfg = Object.assign(readConfig(), patch);
  fs.mkdirSync(defaultDir(), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 1), 'utf8');
}
const dataDir = () => readConfig().dataDir || defaultDir();
const progressFile = (dir = dataDir()) => path.join(dir, 'progress.json');
const backupDir = () => path.join(dataDir(), 'backups');
const BACKUPS_TO_KEEP = 14;

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function loadProgress(dir) {
  try {
    return JSON.parse(fs.readFileSync(progressFile(dir), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Could not read progress:', e);
    return null;
  }
}

function saveProgress(state, dir = dataDir()) {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(progressFile(dir), JSON.stringify(state));
  return true;
}

// One backup per day, keep the most recent BACKUPS_TO_KEEP
function dailyBackup() {
  if (!fs.existsSync(progressFile())) return;
  fs.mkdirSync(backupDir(), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(backupDir(), `progress-${today}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(progressFile(), target);
  const old = fs.readdirSync(backupDir()).filter((f) => /^progress-.*\.json$/.test(f)).sort().reverse().slice(BACKUPS_TO_KEEP);
  for (const f of old) fs.unlinkSync(path.join(backupDir(), f));
}

let strokes = null;
function getStrokes(ch) {
  if (!strokes) strokes = JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'data', 'strokes.json'), 'utf8'));
  return strokes[ch] || null;
}

ipcMain.handle('progress:load', () => loadProgress());
ipcMain.handle('progress:save', (_e, state) => saveProgress(state));
ipcMain.on('progress:save-sync', (e, state) => {
  try { e.returnValue = saveProgress(state); } catch (err) { e.returnValue = false; }
});
ipcMain.handle('strokes:get', (_e, ch) => getStrokes(ch));

// Reference examples (not reviewed): sentences for vocab, common words for kanji
let examples = null;
function getExamples(type, key) {
  if (!examples) examples = JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'data', 'examples.json'), 'utf8'));
  if (type === 'kanji') return examples.k[key] || [];
  return (examples.v[key] || []).map(([si, i0, i1]) => {
    const [tokens, en, id] = examples.s[si];
    return { tokens, en, id, hl: [i0, i1] };
  });
}
ipcMain.handle('examples:get', (_e, type, key) => getExamples(type, key));
ipcMain.handle('progress:export', async (e, state) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export progress',
    defaultPath: `kana-kanji-srs-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(state, null, 1), 'utf8');
  return true;
});
ipcMain.handle('progress:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import progress', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return null;
  return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
});
ipcMain.handle('open-data-folder', () => shell.openPath(dataDir()));
ipcMain.handle('app:about', () => {
  let changelog = '';
  try { changelog = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8'); } catch {}
  return { version: app.getVersion(), changelog };
});
ipcMain.handle('open-speech-settings', () => shell.openExternal('ms-settings:speech'));
ipcMain.handle('open-link', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle('data-dir:get', () => ({ path: dataDir(), isDefault: !readConfig().dataDir, defaultPath: defaultDir() }));
/** Pick a new progress folder (or the default one) and report whether it already holds progress. */
ipcMain.handle('data-dir:choose', async (e, useDefault) => {
  let target = defaultDir();
  if (!useDefault) {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Choose a folder for your progress', properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths.length) return null;
    target = filePaths[0];
  }
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
  } catch {
    return { path: target, error: "That folder can't be written to." };
  }
  const existing = loadProgress(target);
  const info = existing && existing.items
    ? { level: existing.level, savedAt: fs.statSync(progressFile(target)).mtimeMs }
    : null;
  return { path: target, existing: info, same: path.resolve(target) === path.resolve(dataDir()) };
});
/** mode 'use': load the progress already in the folder · mode 'move': write the current progress there */
ipcMain.handle('data-dir:apply', (_e, target, mode, state) => {
  if (mode === 'move') saveProgress(state, target);
  writeConfig({ dataDir: path.resolve(target) === path.resolve(defaultDir()) ? undefined : target });
  return mode === 'use' ? loadProgress(target) : true;
});

// ---------------------------------------------------------------- tray, notifications, sign-in
let win = null;
let tray = null;
let prefs = { closeToTray: true, notifications: true, openAtLogin: false };
app.isQuitting = false;

function showWindow(navigateTo) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (navigateTo) win.webContents.send('navigate', navigateTo);
}

function createTray() {
  if (tray || TEST_RUN) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Kana Kanji SRS');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Kana Kanji SRS', click: () => showWindow() },
    { label: 'Start reviews', click: () => showWindow('reviews') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());
}

ipcMain.handle('app:prefs', (_e, p) => {
  prefs = Object.assign(prefs, p);
  if (prefs.closeToTray) createTray();
  else if (tray) { tray.destroy(); tray = null; }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!prefs.openAtLogin, args: ['--hidden'] });
  return true;
});
ipcMain.handle('tray:info', (_e, text) => { if (tray) tray.setToolTip(text); });
ipcMain.handle('notify', (_e, title, body) => {
  if (!prefs.notifications || !Notification.isSupported()) return false;
  if (win && win.isVisible() && win.isFocused()) return false; // you're already looking at it
  const n = new Notification({ title, body, icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', () => showWindow('reviews'));
  n.show();
  return true;
});

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 900,
    minHeight: 640,
    show: !START_HIDDEN,
    backgroundColor: '#16161d',
    title: 'Kana Kanji SRS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false, // keep the review check running while hidden in the tray
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Keep navigation inside the app; open external links in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (app.isQuitting || !prefs.closeToTray || TEST_RUN || !tray) return;
    e.preventDefault();
    win.hide();
    if (!readConfig().trayHintShown) {
      tray.displayBalloon({ title: 'Still running', content: 'Kana Kanji SRS is in the tray and will tell you when reviews are ready. Right-click the icon to quit.' });
      writeConfig({ trayHintShown: true });
    }
  });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  if (TEST_RUN) require('./scripts/shot-driver')(win, process.env.KKS_SHOT);
}

if (!TEST_RUN && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    try { dailyBackup(); } catch (e) { console.error('Backup failed:', e); }
    createWindow();
    createTray(); // replaced/removed once the renderer sends the saved preferences
  });
}
app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => app.quit());
