// window.api for the web / iPhone version. The Electron app gets window.api from preload.js instead,
// so this file does nothing there.
(function () {
  if (window.api) return;
  const KEY = 'kks-progress';
  const files = {};
  const json = (url) => (files[url] = files[url] || fetch(url).then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); })
    .catch((e) => { delete files[url]; throw e; }));
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { console.error('Could not save progress', e); return false; } };

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10e3);
  }
  const pickFile = () => new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      try { resolve(JSON.parse(await f.text())); } catch (e) { reject(e); }
    };
    input.click();
  });

  let navigate = null;
  window.api = {
    platform: 'web',
    loadProgress: async () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    saveProgress: async (s) => write(s),
    saveProgressSync: (s) => write(s),
    getStrokes: async (ch) => { try { return (await json('data/strokes.json'))[ch] || null; } catch { return null; } },
    getExamples: async (type, key) => {
      try {
        const ex = await json('data/examples.json');
        if (type === 'kanji') return ex.k[key] || [];
        return (ex.v[key] || []).map(([si, i0, i1]) => ({ tokens: ex.s[si][0], en: ex.s[si][1], id: ex.s[si][2], hl: [i0, i1] }));
      } catch { return []; }
    },
    exportProgress: async (s) => { download(`kana-kanji-srs-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(s, null, 1)); return true; },
    importProgress: pickFile,
    about: async () => {
      const [v, changelog] = await Promise.all([
        fetch('version.json').then((r) => r.json()).catch(() => ({ version: 'dev' })),
        fetch('CHANGELOG.md').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      ]);
      return { version: v.version, changelog };
    },
    openLink: (url) => window.open(url, '_blank', 'noopener'),
    openDataFolder() {}, openSpeechSettings() {},
    getDataDir: async () => ({ path: 'This device', isDefault: true }), chooseDataDir: async () => null, applyDataDir: async () => false,
    setAppPrefs: async () => true, setTrayInfo: async () => {}, notify: async () => false,
    onNavigate(cb) { navigate = cb; },
  };

  // Offline support + push alerts. Service workers need https (or localhost).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered:', e));
    // A new version finished installing: reload into it, unless you're in the middle of a lesson or review
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading || document.querySelector('.quiz')) return;
      reloading = true;
      if (window.SRS && SRS.state) SRS.flush();
      location.reload();
    });
    // Tapping an alert while the app is already open
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.navigate && navigate) navigate(e.data.navigate); });
  }
  // Ask the browser not to clear our storage under pressure
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
