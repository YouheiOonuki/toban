// グループ分けのテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const TEXT = require('../text.js');

function klass(n, males, starEvery) {
  const lines = [];
  for (let i = 1; i <= n; i++) lines.push('生徒' + i + ',' + (i <= males ? '男' : '女') + (starEvery && i % starEvery === 0 ? '★' : ''));
  return C.parsePeople(lines.join('\n')).people;
}
function spread(groups, P, has) {
  const c = groups.map((g) => g.filter((n) => has(P[n])).length);
  return Math.max(...c) - Math.min(...c);
}

test('乱数: 同じ seed なら同じ並び、くじ番号の往復', () => {
  const a = C.makeRng(123, 1).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(C.makeRng(123, 1).shuffle([1, 2, 3, 4, 5, 6, 7, 8]), a);
  assert.notDeepEqual(C.makeRng(124, 1).shuffle([1, 2, 3, 4, 5, 6, 7, 8]), a);
  assert.equal(C.seedLabel(123456789), '01234-56789');
  assert.equal(C.parseSeedLabel('０１２３４-５６７８９'), 123456789);
  assert.equal(C.parseSeedLabel('99999999999'), null);
});

test('名簿: 性別の書き方・★・同じ名前・空行・300 人まで', () => {
  const r = C.parsePeople('青木,男\n井上（女）\n\n上田\t女\n江藤 / M ★\n小川,\n青木\n☆加藤');
  assert.deepEqual(r.people.map((p) => [p.name, p.g, p.star]), [
    ['青木', 'M', false], ['井上', 'F', false], ['上田', 'F', false], ['江藤', 'M', true], ['小川', '', false], ['青木②', '', false], ['加藤', '', true]]);
  assert.equal(r.notes[0].code, 'dupNames');
  const big = C.parsePeople(Array.from({ length: 305 }, (_, i) => 'p' + i).join('\n'));
  assert.equal(big.people.length, 300);
  assert.deepEqual(big.notes[0], { code: 'tooManyLines', max: 300, cut: 5 });
  assert.equal(C.numberPeople(3).map((p) => p.name).join(), '1,2,3');
});

test('別の班・同じ班の欄: 区切り・名簿に無い名前・1 人の行', () => {
  const r = C.parseSets('青木、井上\n上田,江藤/小川\n加藤\n木村・青木\n誰か、青木', ['青木', '井上', '上田', '江藤', '小川', '加藤', '木村']);
  assert.deepEqual(r.sets, [['青木', '井上'], ['上田', '江藤', '小川'], ['木村', '青木']]);
  assert.deepEqual(r.unknown, ['誰か']);
});

test('班の人数: 差は 1 人まで', () => {
  assert.deepEqual(C.groupSizes(10, 'count', 3), [4, 3, 3]);
  assert.deepEqual(C.groupSizes(10, 'size', 3), [3, 3, 2, 2]);
  assert.deepEqual(C.groupSizes(12, 'size', 4), [4, 4, 4]);
  assert.deepEqual(C.groupSizes(3, 'count', 6), [1, 1, 1]);
  assert.deepEqual(C.groupSizes(0, 'count', 3), []);
});

test('班分け: 40 人・6 班、男女・★・別の班・同じ班を 200 seed すべてで守る', () => {
  const people = klass(40, 22, 7);
  const P = Object.fromEntries(people.map((p) => [p.name, p]));
  const apart = [['生徒1', '生徒2', '生徒3', '生徒4'], ['生徒10', '生徒30'], ['生徒5', '生徒6']];
  const together = [['生徒11', '生徒12'], ['生徒25', '生徒26', '生徒27']];
  for (let s = 0; s < 200; s++) {
    const r = C.makeGroups({ people, by: 'count', n: 6, gender: true, star: true, apart, together }, s);
    assert.equal(r.ok, true, 'seed ' + s + ' ' + JSON.stringify(r.violations));
    assert.deepEqual(r.groups.map((g) => g.length).sort(), [6, 6, 7, 7, 7, 7]);
    assert.equal(r.groups.flat().length, 40);
    assert.equal(new Set(r.groups.flat()).size, 40);
    assert.ok(spread(r.groups, P, (p) => p.g === 'M') <= 1);
    assert.ok(spread(r.groups, P, (p) => p.g === 'F') <= 1);
    assert.ok(spread(r.groups, P, (p) => p.star) <= 1);
    const gOf = {};
    r.groups.forEach((g, i) => g.forEach((n) => { gOf[n] = i; }));
    apart.forEach((set) => assert.equal(new Set(set.map((n) => gOf[n])).size, set.length));
    together.forEach((set) => assert.equal(new Set(set.map((n) => gOf[n])).size, 1));
  }
});

test('班分け: 同じ seed・同じ入力なら同じ班。班の中は名簿の順', () => {
  const people = klass(30, 15);
  const a = C.makeGroups({ people, by: 'size', n: 4, gender: true }, 42);
  const b = C.makeGroups({ people, by: 'size', n: 4, gender: true }, 42);
  assert.deepEqual(a.groups, b.groups);
  const order = Object.fromEntries(people.map((p, i) => [p.name, i]));
  a.groups.forEach((g) => { for (let i = 1; i < g.length; i++) assert.ok(order[g[i - 1]] < order[g[i]]); });
  assert.notDeepEqual(C.makeGroups({ people, by: 'size', n: 4, gender: true }, 43).groups, a.groups);
});

test('班分け: 条件がないとき、1 人がどの班に入るかは偏らない（3,000 回）', () => {
  const people = klass(24, 0);
  const hit = {};
  for (let s = 0; s < 3000; s++) {
    const r = C.makeGroups({ people, by: 'count', n: 4 }, s);
    // 班の番号は「班の中でいちばん名簿の上の人」の順なので、生徒1 は常に 1 班。生徒1 と同じ班になる割合で見る
    const g = r.groups.find((x) => x.includes('生徒1'));
    g.forEach((n) => { hit[n] = (hit[n] || 0) + 1; });
  }
  // 生徒1 と同じ班になる確率は 5/23。ほかの 23 人それぞれ 3000*5/23 ≒ 652 回
  for (let i = 2; i <= 24; i++) {
    const c = hit['生徒' + i];
    assert.ok(c > 560 && c < 745, '生徒' + i + ' ' + c);
  }
});

test('班分け: 前回と同じ班を避ける（避けられるときは 0 組）', () => {
  const people = klass(24, 12);
  const prev = C.makeGroups({ people, by: 'count', n: 4 }, 1).groups;   // 6 人 × 4 班
  for (let s = 0; s < 30; s++) {
    const r = C.makeGroups({ people, by: 'count', n: 6, prev: [prev] }, s);   // 4 人 × 6 班。前の 4 班から 1 人ずつにすれば 0 組
    assert.equal(r.repeats, 0, 'seed ' + s);
    assert.equal(C.countRepeats(r.groups, [prev]), 0);
  }
  // 避けられないとき（6 人 × 4 班をもう一度）: 前の 4 班から 2・2・1・1 人ずつが最少で、1 班 2 組 × 4 班 = 8 組
  let without = 0;
  for (let s = 0; s < 30; s++) {
    assert.equal(C.makeGroups({ people, by: 'count', n: 4, prev: [prev] }, s).repeats, 8, 'seed ' + s);
    without += C.countRepeats(C.makeGroups({ people, by: 'count', n: 4 }, s).groups, [prev]);
  }
  assert.ok(without / 30 > 10, String(without));
});

test('班分け: 数でわかる矛盾と、守れなかった条件を名前で返す', () => {
  const people = klass(12, 6);
  const r1 = C.makeGroups({ people, by: 'count', n: 3, apart: [['生徒1', '生徒2', '生徒3', '生徒4']] }, 1);
  assert.equal(r1.pre[0].code, 'apartTooMany');
  assert.equal(r1.ok, false);
  assert.equal(r1.violations[0].code, 'apartBroken');
  const r2 = C.makeGroups({ people, by: 'count', n: 3, together: [['生徒1', '生徒2', '生徒3', '生徒4', '生徒5']] }, 1);
  assert.equal(r2.pre[0].code, 'togetherTooBig');
  const r3 = C.makeGroups({ people, by: 'count', n: 3, apart: [['生徒1', '生徒2']], together: [['生徒1', '生徒2']] }, 1);
  assert.deepEqual(r3.pre, [{ code: 'apartAndTogether', a: '生徒1', b: '生徒2' }]);
  // 画面の文がどれにもある（日本語・英語）
  [...r1.pre, ...r1.violations, ...r2.pre, ...r2.violations, ...r3.pre, ...r3.violations].forEach((n) => {
    assert.equal(typeof TEXT.ja[n.code], 'function', n.code);
    assert.equal(typeof TEXT.en[n.code], 'function', n.code);
    assert.ok(TEXT.ja[n.code](n).length > 5 && TEXT.en[n.code](n).length > 5);
  });
  assert.deepEqual(C.makeGroups({ people: [], by: 'count', n: 3 }, 1).pre, [{ code: 'noPeople' }]);
});

test('班分け: 300 人・75 班・男女と別の班でも時間内（2 秒）', () => {
  const people = klass(300, 170);
  const t0 = Date.now();
  const r = C.makeGroups({ people, by: 'size', n: 4, gender: true, apart: [['生徒1', '生徒2', '生徒3']], together: [['生徒10', '生徒11']] }, 3);
  const r2 = C.makeGroups({ people, by: 'size', n: 4, gender: true, prev: [r.groups] }, 4);
  assert.ok(Date.now() - t0 < 2000, (Date.now() - t0) + 'ms');
  assert.equal(r.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r2.repeats, 0);
});

test('共有リンク: 既定で名前が入らない・名前つきの往復・壊れたもの', () => {
  const people = klass(10, 5, 3);
  const r = C.makeGroups({ people, by: 'count', n: 3, gender: true }, 9);
  const noName = C.encodeGroupShare({ people, seed: 9, groups: r.groups, title: '3年2組' }, false);
  assert.ok(!Buffer.from(noName.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').includes('生徒'));
  const d1 = C.decodeGroupShare('#s=' + noName);
  assert.equal(d1.people, null);
  assert.equal(d1.title, '');
  const pos = Object.fromEntries(people.map((p, i) => [p.name, String(i + 1)]));
  assert.deepEqual(d1.groups, r.groups.map((g) => g.map((n) => pos[n])));
  const d2 = C.decodeGroupShare('#s=' + C.encodeGroupShare({ people, seed: 9, groups: r.groups, title: '3年2組' }, true));
  assert.deepEqual(d2.groups, r.groups);
  assert.deepEqual(d2.people, people);
  assert.equal(d2.title, '3年2組');
  assert.equal(d2.seed, 9);
  for (const bad of ['', '#s=', '#s=@@@', '#s=' + Buffer.from('{"v":2}').toString('base64url'), '#s=' + Buffer.from('{"v":1,"t":"g","k":3,"r":[]}').toString('base64url')]) {
    assert.equal(C.decodeGroupShare(bad), null, bad);
  }
  // 番号が重なっていても 1 回だけ
  const dup = C.decodeGroupShare('#s=' + Buffer.from(JSON.stringify({ v: 1, t: 'g', k: 3, s: 1, r: [[0, 0, 1], [1, 2, 9]] })).toString('base64url'));
  assert.deepEqual(dup.groups, [['1', '2'], ['3']]);
});

test('保存データの正規化と記録', () => {
  const g = C.normalizeGroup({ people: 'a\nb', by: 'x', n: 'abc', gender: 1, history: [{ at: 'x', groups: [['a', ''], []] }, 'bad'], credit: undefined });
  assert.equal(g.by, 'count');
  assert.equal(g.n, 6);
  assert.equal(g.gender, true);
  assert.equal(g.credit, true);
  assert.deepEqual(g.history, [{ at: 'x', groups: [['a']] }]);
  let h = [];
  for (let i = 0; i < 12; i++) h = C.addHistory(h, { at: String(i), groups: [['a']] });
  assert.equal(h.length, 10);
  assert.equal(h[0].at, '11');
});
