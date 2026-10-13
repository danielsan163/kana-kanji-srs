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
    // A new version finished installing: reload into it, or as soon as you finish the lesson or review you're in
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    const reloadWhenFree = () => {
      if (reloading) return;
      if (document.querySelector('.quiz')) { setTimeout(reloadWhenFree, 3000); return; }
      reloading = true;
      if (window.SRS && SRS.state) SRS.flush();
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reloadWhenFree(); });
    // iPhone often resumes a Home Screen app instead of restarting it, so also look for updates
    // whenever the app comes back to the front (and every half hour while it's open)
    const lookForUpdate = () => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lookForUpdate(); });
    setInterval(lookForUpdate, 30 * 60e3);

    const running = fetch('version.json').then((r) => r.json()).catch(() => ({ version: '?', build: '?' })); // from the offline copy
    /** Compare the running build with the one on the server and start updating if they differ. */
    window.api.checkForUpdate = async () => {
      const [current, latest] = await Promise.all([running, fetch('version.json?check=' + Date.now(), { cache: 'no-store' }).then((r) => r.json())]);
      if (latest.build !== current.build) await lookForUpdate();
      return { current, latest, newer: latest.build !== current.build };
    };
    /** Last resort: drop the offline copy and load everything fresh. Progress (stored separately) is untouched. */
    window.api.forceUpdate = async () => {
      if (window.SRS && SRS.state) SRS.flush();
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) if (k.startsWith('kks-')) await caches.delete(k);
      location.reload();
    };
    // Tapping an alert while the app is already open
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.navigate && navigate) navigate(e.data.navigate); });
  }
  // Ask the browser not to clear our storage under pressure
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
