// 使い方の「出典の URL」の折りたたみ（#notes の details）の URL のリンクは折り返す（yorozu-plans QUEUE Q-728: 320 幅で開くと +70 px あふれた）。
// 規則は共通の枠（yorozu-common:begin〜end）の外に置く。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('#notes の details の中のリンクに overflow-wrap: anywhere（共通の枠の外）', () => {
  const css = read('style.css');
  const own = css.slice(css.indexOf('/* yorozu-common:end */'));
  assert.match(own, /#notes details a\s*\{[^}]*overflow-wrap:\s*anywhere/);
  const notes = read('guide.html').match(/<article[^>]*id="notes">([\s\S]*?)<\/article>/);
  assert.ok(notes, 'guide.html に #notes がある');
  assert.match(notes[1], /<details>[\s\S]*?<a href="https:\/\/[^"]+"[^>]*>https:\/\/[\s\S]*?<\/details>/);
});
