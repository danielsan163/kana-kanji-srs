const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('KanaKanjiSRS');
app.setPath('userData', process.env.KKS_USERDATA || path.join(app.getPath('appData'), 'KanaKanjiSRS'));

const dataDir = () => app.getPath('userData');
const progressFile = () => path.join(dataDir(), 'progress.json');
const backupDir = () => path.join(dataDir(), 'backups');
const BACKUPS_TO_KEEP = 14;

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(progressFile(), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Could not read progress:', e);
    return null;
  }
}

function saveProgress(state) {
  fs.mkdirSync(dataDir(), { recursive: true });
  writeAtomic(progressFile(), JSON.stringify(state));
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
ipcMain.handle('open-speech-settings', () => shell.openExternal('ms-settings:speech'));
ipcMain.handle('open-link', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 900,
    minHeight: 640,
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
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Keep navigation inside the app; open external links in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  if (process.env.KKS_SHOT) require('./scripts/shot-driver')(win, process.env.KKS_SHOT);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  try { dailyBackup(); } catch (e) { console.error('Backup failed:', e); }
  createWindow();
});
app.on('window-all-closed', () => app.quit());
