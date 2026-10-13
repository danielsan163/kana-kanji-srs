// Builds the web / iPhone version into web-dist/: npm run build-web
// It's the same app/ folder plus the changelog, a version file, the Klee One font (textbook style
// for iPhones, which don't have Windows' Kyokasho font) and a cache stamp for the service worker.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web-dist');
const FONT = path.join(ROOT, 'node_modules', '@fontsource', 'klee-one');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'CHANGELOG.md'), path.join(OUT, 'CHANGELOG.md'));
const { version } = require(path.join(ROOT, 'package.json'));

// Klee One: keep only the woff2 pieces; each covers a slice of characters and loads only when needed
const fontDir = path.join(OUT, 'fonts', 'files');
fs.mkdirSync(fontDir, { recursive: true });
let css = '';
for (const weight of ['400', '600']) {
  css += fs.readFileSync(path.join(FONT, `${weight}.css`), 'utf8')
    .replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\), url\([^)]+\.woff\) format\('woff'\)/g, (_, f) => {
      fs.copyFileSync(path.join(FONT, 'files', f), path.join(fontDir, f));
      return `url(files/${f}) format('woff2')`;
    }) + '\n';
}
fs.writeFileSync(path.join(OUT, 'fonts', 'klee-one.css'), css);
fs.copyFileSync(path.join(FONT, 'LICENSE'), path.join(OUT, 'fonts', 'LICENSE-KleeOne.txt'));

const indexFile = path.join(OUT, 'index.html');
fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="fonts/klee-one.css">\n  <link rel="stylesheet" href="styles.css">'));

// Cache stamp: a hash of everything the service worker serves, so any change ships a fresh cache
const hash = crypto.createHash('sha256');
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f !== 'sw.js') hash.update(f).update(fs.readFileSync(p));
  }
})(OUT);
const build = `${version}-${hash.digest('hex').slice(0, 10)}`;
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ version, build }));
const swFile = path.join(OUT, 'sw.js');
fs.writeFileSync(swFile, fs.readFileSync(swFile, 'utf8').replace("const BUILD = 'dev';", `const BUILD = '${build}';`));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`web-dist built: version ${version}, build ${build}`);
