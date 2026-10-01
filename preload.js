const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadProgress: () => ipcRenderer.invoke('progress:load'),
  saveProgress: (state) => ipcRenderer.invoke('progress:save', state),
  saveProgressSync: (state) => ipcRenderer.sendSync('progress:save-sync', state),
  exportProgress: (state) => ipcRenderer.invoke('progress:export', state),
  importProgress: () => ipcRenderer.invoke('progress:import'),
  getStrokes: (ch) => ipcRenderer.invoke('strokes:get', ch),
  getExamples: (type, key) => ipcRenderer.invoke('examples:get', type, key),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  openSpeechSettings: () => ipcRenderer.invoke('open-speech-settings'),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
});
