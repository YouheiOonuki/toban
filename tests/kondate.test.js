'use strict';
// 献立ローテーション表（kondate/）のテスト: 読み取り・同じ料理が出ない・種類を続けない・決まった日・作らない曜日・くじの再現・正規化・ページの決まり
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../kondate/kondate-calc.js');

const flat = (m) => [].concat(...m.weeks);
const base = (o) => Object.assign({ start: '2026-10-05', weeks: 2, skipDays: [], fixed: {}, noSameKind: true }, o);

test('料理の読み取り: 1 行 1 品、「,種類」、区切りいろいろ、重複と空行を除く', () => {
  const d = K.parseDishes('ハンバーグ,肉\n鮭の塩焼き、魚\n\n親子丼\t卵\nカレー／肉\nハンバーグ,魚\n  ');
  assert.deepEqual(d, [
    { name: 'ハンバーグ', kind: '肉' }, { name: '鮭の塩焼き', kind: '魚' }, { name: '親子丼', kind: '卵' }, { name: 'カレー', kind: '肉' },
  ]);
  assert.equal(K.parseDishes(Array.from({ length: 80 }, (_, i) => '料理' + i).join('\n')).length, K.LIMITS.dishes);
});

test('決まった日: 「金: カレー」「日曜日：手巻きずし」', () => {
  assert.deepEqual(K.parseFixed('金: カレー\n日曜日：手巻きずし\nおかしな行'), { 5: 'カレー', 0: '手巻きずし' });
});

test('7 品で 1 週間なら同じ料理は出ない。14 品・2 週間も', () => {
  const seven = K.parseDishes('a\nb\nc\nd\ne\nf\ng');
  for (let seed = 0; seed < 30; seed++) {
    const m = K.makeMenu(base({ dishes: seven, weeks: 1 }), seed);
    assert.equal(new Set(flat(m).map((c) => c.dish)).size, 7);
    assert.deepEqual(m.notes, []);
  }
  const fourteen = K.parseDishes(Array.from({ length: 14 }, (_, i) => 'x' + i).join('\n'));
  assert.equal(new Set(flat(K.makeMenu(base({ dishes: fourteen }), 3)).map((c) => c.dish)).size, 14);
});

test('料理が日数より少ないとき: 回数の差は 1 まで、同じ料理の間は品数ぶんあく', () => {
  const five = K.parseDishes('a\nb\nc\nd\ne');
  const m = K.makeMenu(base({ dishes: five, weeks: 2 }), 11);
  const counts = Object.values(m.counts);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  assert.ok(m.notes.includes('repeat'));
  const seq = flat(m).map((c) => c.dish);
  for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < Math.min(seq.length, i + 5); j++) assert.notEqual(seq[i], seq[j], `${i}-${j}`);
});

test('同じ種類を続けない: 肉 3・魚 3・卵 2 で 1 週間なら続かない。off なら見ない', () => {
  const d = K.parseDishes('肉1,肉\n肉2,肉\n肉3,肉\n魚1,魚\n魚2,魚\n魚3,魚\n卵1,卵\n卵2,卵');
  for (let seed = 0; seed < 50; seed++) {
    const m = K.makeMenu(base({ dishes: d, weeks: 1 }), seed);
    assert.equal(K.sameKindRuns(m.weeks), 0, 'seed ' + seed);
  }
  const allMeat = K.parseDishes('a,肉\nb,肉\nc,肉\nd,魚');
  const m = K.makeMenu(base({ dishes: allMeat, weeks: 1 }), 1);
  assert.ok(K.sameKindRuns(m.weeks) > 0); // 種類が足りないときは続く（画面で回数を出す）
});

test('決まった日と作らない曜日', () => {
  const d = K.parseDishes('a\nb\nc\nd\ne\nf\ngカレー\nカレー');
  const m = K.makeMenu(base({ dishes: d, weeks: 2, fixed: { 5: 'カレー' }, skipDays: [0] }), 4);
  for (const c of flat(m)) {
    if (c.w === 5) { assert.equal(c.dish, 'カレー'); assert.ok(c.fixed); }
    else if (c.w === 0) { assert.ok(c.skip); assert.equal(c.dish, null); }
    else assert.notEqual(c.dish, 'カレー'); // リストにあるカレーは金曜で 1 回ずつ数える
  }
  // 2026-10-05 は月曜
  assert.equal(m.weeks[0][0].w, 1);
  assert.equal(m.weeks[1][6].date, '2026-10-18');
});

test('くじ: 同じ seed・同じ入力なら同じ表、seed を変えると変わる（入力の順だけでは決まらない）', () => {
  const d = K.parseDishes(K.SAMPLE);
  const a = K.makeMenu(base({ dishes: d }), 12345);
  const b = K.makeMenu(base({ dishes: d }), 12345);
  assert.deepEqual(a, b);
  const seqs = new Set();
  for (let s = 0; s < 10; s++) seqs.add(flat(K.makeMenu(base({ dishes: d }), s)).map((c) => c.dish).join(','));
  assert.ok(seqs.size > 5);
});

test('はじめの日が読めないとき・料理が空のとき', () => {
  assert.deepEqual(K.makeMenu(base({ dishes: [], start: 'x' }), 1).notes, ['noStart']);
  const m = K.makeMenu(base({ dishes: [] }), 1);
  assert.ok(m.notes.includes('noDishes'));
  assert.ok(flat(m).every((c) => c.dish === null));
});

test('次の月曜と正規化', () => {
  assert.equal(K.nextMonday(new Date(2026, 9, 3)), '2026-10-05'); // 土 → 月
  assert.equal(K.nextMonday(new Date(2026, 9, 5)), '2026-10-05'); // 月はその日
  const d = K.normalize(null, new Date(2026, 9, 3));
  assert.equal(d.start, '2026-10-05');
  assert.equal(K.parseDishes(d.dishes).length, 12);
  const s = K.normalize({ dishes: 5, start: '2026-02-30', weeks: 9, skipDays: [0, 0, 7, 'x', 6], fixed: 3, noSameKind: false, seed: -1, title: 'あ'.repeat(60) }, new Date(2026, 9, 3));
  assert.equal(s.start, '2026-10-05');
  assert.equal(s.weeks, 2);
  assert.deepEqual(s.skipDays, [0, 6]);
  assert.equal(s.noSameKind, false);
  assert.equal(s.seed, 1);
  assert.equal(s.title.length, 40);
});

test('ページの決まり: 保存キー toban_kondate・消すボタン・sitemap・sw', () => {
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  assert.ok(read('kondate/index.html').includes('data-reset-storage="toban_kondate"'));
  assert.match(read('kondate/kondate.js'), /var KEY = 'toban_kondate';/);
  assert.ok(read('sitemap.xml').includes('https://yorozu-craft.com/toban/kondate/'));
  for (const f of ['./kondate/', './kondate/index.html', './kondate/kondate.js', './kondate/kondate-calc.js', './kondate/kondate.css', './kondate/guide.html']) assert.ok(read('sw.js').includes(`'${f}'`), f);
});
