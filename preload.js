const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: 'electron',
  loadProgress: () => ipcRenderer.invoke('progress:load'),
  saveProgress: (state) => ipcRenderer.invoke('progress:save', state),
  saveProgressSync: (state) => ipcRenderer.sendSync('progress:save-sync', state),
  exportProgress: (state) => ipcRenderer.invoke('progress:export', state),
  importProgress: () => ipcRenderer.invoke('progress:import'),
  getStrokes: (ch) => ipcRenderer.invoke('strokes:get', ch),
  getExamples: (type, key) => ipcRenderer.invoke('examples:get', type, key),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  about: () => ipcRenderer.invoke('app:about'),
  openSpeechSettings: () => ipcRenderer.invoke('open-speech-settings'),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  getDataDir: () => ipcRenderer.invoke('data-dir:get'),
  chooseDataDir: (useDefault) => ipcRenderer.invoke('data-dir:choose', useDefault),
  applyDataDir: (target, mode, state) => ipcRenderer.invoke('data-dir:apply', target, mode, state),
  setAppPrefs: (prefs) => ipcRenderer.invoke('app:prefs', prefs),
  setTrayInfo: (text) => ipcRenderer.invoke('tray:info', text),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_e, view) => cb(view)),
});
