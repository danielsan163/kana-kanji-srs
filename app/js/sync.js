// Sync: email + password sign-in and progress sync through Supabase, plus phone push alerts.
// Talks to Supabase's REST endpoints directly with fetch, so there's no library to bundle.
(function () {
  const SUPABASE_URL = 'https://lznraybjpvhbujklkmli.supabase.co';
  // Publishable key: meant to ship in the app. Row-level security limits every account to its own rows.
  const SUPABASE_KEY = 'sb_publishable_qcIULwp2LsAkxUmlcpZzwA_x2Pl9r8L';
  // Public half of the push (VAPID) key pair; the private half only exists as a Supabase function secret
  const VAPID_PUBLIC_KEY = 'BERjO8Rhg_s1HVmNBMHetw_TA1_CAKZ_t47CF1H78PTVyyxJqyszcB8NhU-95Y0VMZpbIhB9ytn409WkJZIkl-0';
  const SYNC_DELAY = 15e3;     // after a change
  const POLL_EVERY = 120e3;    // while the app is open and visible

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const K_SESSION = 'kks-session', K_SYNCED_USER = 'kks-synced-user', K_LAST = 'kks-last-sync';
  const deviceName = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : window.api.platform === 'electron' ? 'Windows PC' : 'Browser';

  let session = ls.get(K_SESSION);
  const status = { state: session ? 'idle' : 'signed-out', lastSync: ls.get(K_LAST), error: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(status); } catch (e) { console.error(e); } });
  const setStatus = (patch) => { Object.assign(status, patch); emit(); };

  // ------------------------------------------------------------------ HTTP
  async function call(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
    if (auth) h.Authorization = 'Bearer ' + (await accessToken());
    const r = await fetch(SUPABASE_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || r.statusText || 'Request failed');
      e.status = r.status;
      throw e;
    }
    return data;
  }

  // ------------------------------------------------------------------ auth
  function setSession(s) {
    session = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: { id: s.user.id, email: s.user.email },
    };
    ls.set(K_SESSION, session);
  }
  let refreshing = null;
  async function accessToken() {
    if (!session) throw Object.assign(new Error('Not signed in'), { status: 401 });
    if (session.expires_at * 1000 - Date.now() > 60e3) return session.access_token;
    refreshing = refreshing || call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } })
      .then(setSession)
      .catch((e) => { if (e.status === 400 || e.status === 401) forgetSession('Signed out. Please sign in again.'); throw e; })
      .finally(() => { refreshing = null; });
    await refreshing;
    return session.access_token;
  }
  function forgetSession(message = '') {
    session = null;
    ls.del(K_SESSION);
    setStatus({ state: 'signed-out', error: message });
  }
  /** Create the account. Returns true if signed in right away, false if the email must be confirmed first. */
  async function signUp(email, password) {
    const res = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } });
    if (!res || !res.access_token) return false;
    setSession(res);
    setStatus({ state: 'idle', error: '' });
    await syncNow();
    return true;
  }
  async function signIn(email, password) {
    setSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
    setStatus({ state: 'idle', error: '' });
    await syncNow();
  }
  async function signOut() {
    try { await disablePush(); } catch {}
    try { await call('/auth/v1/logout', { method: 'POST' }); } catch {}
    ls.del(K_SYNCED_USER);
    forgetSession();
  }

  // ------------------------------------------------------------------ sync
  // Key-order-independent JSON, so "same data" never looks like a change
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  const hasProgress = (s) => Object.values(s.items || {}).some((p) => p.s >= 1);

  /** Review times for the alert job: [[hour, count], …] for the next 30 days, overdue ones at their own hour. */
  function dueBuckets(s) {
    if (s.vacation) return [];
    const H = 3600e3, limit = Date.now() + 30 * 86400e3;
    const m = new Map();
    for (const [id, p] of Object.entries(s.items)) {
      if (p.s < 1 || p.s >= SRS.BURNED || !p.a || p.a > limit || !SRS.byId.has(id)) continue;
      const h = Math.floor(p.a / H) * H;
      m.set(h, (m.get(h) || 0) + 1);
    }
    return [...m].sort((a, b) => a[0] - b[0]);
  }

  /** Decide what the synced progress should be, given this device's and the cloud's. Null = cancelled. */
  async function resolve(local, remote) {
    const firstTime = ls.get(K_SYNCED_USER) !== session.user.id;
    if (firstTime) {
      if (!hasProgress(local)) return SRS.adopt(local, remote);
      if (!hasProgress(remote)) return { ...local, epoch: Date.now() };
      const choice = await api.onConflict({ local, remote });
      if (choice === 'cloud') return SRS.adopt(local, remote);
      if (choice === 'device') return { ...local, epoch: Date.now() };
      if (choice === 'merge') return SRS.merge(local, { ...remote, epoch: local.epoch });
      return null;
    }
    if (remote.epoch === local.epoch) return SRS.merge(local, remote);
    return remote.epoch > local.epoch ? SRS.adopt(local, remote) : local;
  }

  async function doSync() {
    const uid = session.user.id;
    for (let attempt = 0; attempt < 4; attempt++) {
      const rows = await call('/rest/v1/progress?select=data,rev');
      const remote = rows[0];
      const local = SRS.state;
      const merged = remote ? await resolve(local, remote.data) : local;
      if (!merged) return false;
      const body = { data: merged, due: dueBuckets(merged), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, device: deviceName };
      let saved = true;
      if (!remote) {
        try { await call('/rest/v1/progress', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { ...body, rev: 1 } }); }
        catch (e) { if (e.status === 409) saved = false; else throw e; }
      } else if (stable(merged) !== stable(remote.data)) {
        // Only succeeds if nobody else saved since we read (rev unchanged); otherwise read again and re-merge
        const res = await call(`/rest/v1/progress?user_id=eq.${uid}&rev=eq.${remote.rev}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: { ...body, rev: remote.rev + 1, updated_at: new Date().toISOString() },
        });
        saved = res.length > 0;
      }
      if (!saved) continue;
      ls.set(K_SYNCED_USER, uid);
      // Anything you did while we were waiting on the network (an answer, a note) is newer, so it wins
      const current = SRS.state;
      const next = current.epoch === merged.epoch ? SRS.merge(current, merged) : merged;
      if (stable(next) !== stable(current)) {
        SRS.replaceState(next);
        api.onRemoteChange();
      }
      if (stable(next) !== stable(merged)) schedule();
      return true;
    }
    throw new Error('Another device kept saving at the same moment. Will try again shortly.');
  }

  let running = null, again = false, timer = null;
  function syncNow() {
    if (!session) return Promise.resolve(false);
    if (running) { again = true; return running; }
    clearTimeout(timer);
    setStatus({ state: 'syncing', error: '' });
    running = doSync()
      .then((ok) => {
        if (ok) { status.lastSync = Date.now(); ls.set(K_LAST, status.lastSync); }
        setStatus({ state: session ? 'idle' : 'signed-out' });
        return ok;
      })
      .catch((e) => {
        console.warn('Sync failed:', e);
        if (session) setStatus({ state: navigator.onLine ? 'error' : 'offline', error: navigator.onLine ? e.message : '' });
        return false;
      })
      .finally(() => {
        running = null;
        if (again) { again = false; schedule(1000); }
      });
    return running;
  }
  function schedule(delay = SYNC_DELAY) {
    if (!session) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, delay);
  }

  function start() {
    SRS.onChange(() => schedule());
    setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, POLL_EVERY);
    document.addEventListener('visibilitychange', () => syncNow()); // coming back, or leaving (save before iOS suspends us)
    window.addEventListener('online', () => syncNow());
    syncNow();
  }

  // ------------------------------------------------------------------ push alerts (installed web app only)
  const b64ToBytes = (b64) => {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };
  async function swRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
  }
  const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  /** 'on' | 'off' | 'denied' | 'needs-install' | 'unsupported' */
  async function pushStatus() {
    const reg = await swRegistration();
    if (!reg) return /iPhone|iPad/.test(navigator.userAgent) && !isInstalled() ? 'needs-install' : 'unsupported';
    if (await reg.pushManager.getSubscription()) return 'on';
    return typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'denied' : 'off';
  }
  async function enablePush() {
    const reg = await swRegistration();
    if (!reg) throw new Error('Alerts need the app added to your Home Screen.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them in iPhone Settings → Notifications.');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    await call('/rest/v1/push_subscriptions', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { endpoint: j.endpoint, keys: j.keys, device: deviceName },
    });
    await syncNow(); // make sure the alert job has your latest review times
  }
  async function disablePush() {
    const reg = await swRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    if (session) { try { await call(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }); } catch {} }
    await sub.unsubscribe();
  }

  const api = {
    get signedIn() { return !!session; },
    get email() { return session ? session.user.email : null; },
    status,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    signUp, signIn, signOut, syncNow, schedule, start,
    pushStatus, enablePush, disablePush, isInstalled,
    // set by the UI
    onConflict: async () => null,
    onRemoteChange: () => {},
  };
  window.Sync = api;
})();
