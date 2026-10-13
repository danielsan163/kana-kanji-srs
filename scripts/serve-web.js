// Serves web-dist/ for local testing: node scripts/serve-web.js [port] [--lan]
// --lan also listens on your network so a phone on the same Wi-Fi can open it (no offline mode or
// alerts there, since those need https; layout, study and sync all work).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', 'web-dist');
const port = +process.argv.find((a) => /^\d+$/.test(a)) || 5173;
const lan = process.argv.includes('--lan');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Serving web-dist on http://localhost:${port}`);
  if (lan) for (const nets of Object.values(os.networkInterfaces())) for (const n of nets) {
    if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${port}`);
  }
});
