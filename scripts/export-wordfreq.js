// Exports wordfreq's Japanese word frequencies to raw/ja-wordfreq.tsv for scripts/primary-readings.js.
// wordfreq data: CC BY-SA 4.0 (https://github.com/rspeer/wordfreq). No Python needed: take
// wordfreq/data/large_ja.msgpack.gz out of the wordfreq wheel from PyPI (it's a zip) into raw/, then
//   node scripts/export-wordfreq.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAW = path.join(__dirname, '..', 'raw');

// Just enough MessagePack for wordfreq's files: arrays, maps, strings, small ints, nil and booleans
function unpack(buf) {
  let i = 0;
  const str = (n) => { const s = buf.toString('utf8', i, i + n); i += n; return s; };
  const arr = (n) => { const a = []; for (let k = 0; k < n; k++) a.push(read()); return a; };
  const map = (n) => { const o = {}; for (let k = 0; k < n; k++) { const key = read(); o[key] = read(); } return o; };
  function read() {
    const b = buf[i++];
    if (b <= 0x7f) return b;
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return buf[i++];
      case 0xcd: i += 2; return buf.readUInt16BE(i - 2);
      case 0xce: i += 4; return buf.readUInt32BE(i - 4);
      case 0xd9: return str(buf[i++]);
      case 0xda: i += 2; return str(buf.readUInt16BE(i - 2));
      case 0xdb: i += 4; return str(buf.readUInt32BE(i - 4));
      case 0xdc: i += 2; return arr(buf.readUInt16BE(i - 2));
      case 0xdd: i += 4; return arr(buf.readUInt32BE(i - 4));
      case 0xde: i += 2; return map(buf.readUInt16BE(i - 2));
      default: throw new Error(`unsupported msgpack byte 0x${b.toString(16)} at ${i - 1}`);
    }
  }
  return read();
}

// "cBpack": a header, then one list of words per centibel; list n holds words with frequency 10^(-n/100)
const [header, ...buckets] = unpack(zlib.gunzipSync(fs.readFileSync(path.join(RAW, 'large_ja.msgpack.gz'))));
if (!header || header.format !== 'cB') throw new Error('not a wordfreq cBpack file');
const hasKanji = /[㐀-鿿々]/;
const lines = [];
buckets.forEach((words, n) => {
  for (const w of words) if (hasKanji.test(w)) lines.push(`${w}\t${Math.pow(10, -n / 100).toExponential(3)}`);
});
fs.writeFileSync(path.join(RAW, 'ja-wordfreq.tsv'), lines.join('\n') + '\n');
console.log(`wrote ${lines.length} words to raw/ja-wordfreq.tsv`);
