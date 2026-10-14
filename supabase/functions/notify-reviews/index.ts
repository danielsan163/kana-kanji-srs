// Sends "reviews ready" alerts to phones. Called every 15 minutes by a pg_cron job (see schema.sql).
// For each account with alerts on: if reviews came due since the last alert, push "N reviews ready",
// except during quiet hours (10 pm–8 am in the account's time zone); the morning run catches up.
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const QUIET_FROM = 22, QUIET_UNTIL = 8;

webpush.setVapidDetails(
  'https://github.com/danielsan163/kana-kanji-srs',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function localHour(tz: string | null, now: Date) {
  try {
    return +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || 'UTC' }).format(now);
  } catch {
    return now.getUTCHours();
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) return new Response('Forbidden', { status: 403 });
  const now = new Date();
  const subs: { endpoint: string; keys: { p256dh: string; auth: string }; user_id: string }[] =
    await db('push_subscriptions?select=endpoint,keys,user_id');
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  let sent = 0;
  for (const [uid, list] of byUser) {
    const rows = await db(`progress?select=due,tz,notified_at&user_id=eq.${uid}`);
    const row = rows[0];
    if (!row) continue;
    const h = localHour(row.tz, now);
    if (h >= QUIET_FROM || h < QUIET_UNTIL) continue;
    const since = row.notified_at ? Date.parse(row.notified_at) : 0;
    const due: [number, number][] = row.due || [];
    const ready = due.filter(([t]) => t <= now.getTime()).reduce((n, [, c]) => n + c, 0);
    const fresh = due.some(([t]) => t > since && t <= now.getTime());
    if (!ready || !fresh) continue;

    const payload = JSON.stringify({ title: 'Reviews ready', count: ready, body: `${ready} review${ready === 1 ? ' is' : 's are'} waiting. Tap to start.` });
    for (const s of list) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The phone removed the app or turned alerts off: forget this subscription
        if (code === 404 || code === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
        else console.error('push failed', code, e);
      }
    }
    await db(`progress?user_id=eq.${uid}`, { method: 'PATCH', body: JSON.stringify({ notified_at: now.toISOString() }) });
  }
  return new Response(JSON.stringify({ users: byUser.size, sent }), { headers: { 'Content-Type': 'application/json' } });
});
