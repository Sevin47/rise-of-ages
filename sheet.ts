/** Dev tool: writes an inspection sheet of every icon in the set. */
// Declared locally so the sheet builds without pulling @types/node in for the
// two globals it needs. It compiles to CommonJS, so require is the way in.
declare const process: { argv: string[] };
declare const require: (m: string) => {
  writeFileSync: (p: string, data: string, enc: string) => void;
};

const { writeFileSync } = require('node:fs');
import { ICONS } from './src/art';

const cells = Object.entries(ICONS)
  .map(
    ([name, svg]) =>
      `<figure><div class="box">${svg}</div><figcaption>${name}</figcaption></figure>`,
  )
  .join('');

writeFileSync(
  process.argv[2],
  `<!doctype html><meta charset="utf-8"><title>Rise of Ages icon sheet</title>
<style>
  body{margin:0;padding:28px;background:#efe2c2;font:13px/1.4 'Segoe UI',system-ui,sans-serif;color:#211a12}
  h1{font:700 22px Georgia,serif;margin:0 0 18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}
  figure{margin:0;text-align:center}
  .box{background:linear-gradient(180deg,#fffbee,#cbb387);border:1px solid #8a6d16;border-radius:6px;padding:10px}
  svg{width:88px;height:88px;display:block;margin:0 auto}
  figcaption{margin-top:5px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#4a3c2b}
</style>
<h1>Rise of Ages &mdash; icon set (${Object.keys(ICONS).length} icons, all original SVG)</h1>
<div class="grid">${cells}</div>`,
  'utf8',
);
console.log('wrote', process.argv[2]);
