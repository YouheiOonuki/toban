// 当番表のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const K = require('../constants.js');
const TEXT = require('../text.js');

const WEEKDAYS = [1, 2, 3, 4, 5];
function rows(start, end, unit, extra) {
  return C.dutyRows(Object.assign({ start, end, unit: unit || 'day', days: WEEKDAYS, skipHolidays: true, holidays: K.HOLIDAYS }, extra || {}));
}

test('当番の種類: 人数の書き方・重複・上限', () => {
  const r = C.parseDuties('日直\n給食 2\n黒板,３\n花の水×2人\n掃除：4\n日直\n10\n' + Array.from({ length: 12 }, (_, i) => 'x' + i).join('\n'));
  assert.deepEqual(r.duties.slice(0, 6), [{ name: '日直', k: 1 }, { name: '給食', k: 2 }, { name: '黒板', k: 3 }, { name: '花の水', k: 2 }, { name: '掃除', k: 4 }, { name: '10', k: 1 }]);
  assert.equal(r.duties.length, 12);
  assert.equal(r.notes[0].code, 'tooManyDuties');
});

test('期間: 日ごと（平日・祝日を除く）・週ごと・1 か月後', () => {
  const r = rows('2026-10-01', '2026-10-31');
  assert.equal(r.rows.length, 21);   // 10 月の平日 22 日 − スポーツの日（10/12）
  assert.deepEqual(r.skipped, [{ date: '2026-10-12', name: 'スポーツの日' }]);
  assert.equal(rows('2026-10-01', '2026-10-31', 'day', { skipHolidays: false }).rows.length, 22);
  const w = rows('2026-09-16', '2026-10-04', 'week');
  assert.deepEqual(w.rows.map((x) => [x.from, x.to]), [['2026-09-16', '2026-09-18'], ['2026-09-24', '2026-09-25'], ['2026-09-28', '2026-10-02']]);   // 9/21〜23 は祝日と休日
  const gw = rows('2026-05-04', '2026-05-06', 'week');   // 5/4〜5/6 は全部休み → 行なし
  assert.equal(gw.rows.length, 0);
  assert.equal(gw.notes[0].code, 'noRows');
  assert.equal(rows('2026-10-10', '2026-10-01').notes[0].code, 'endBeforeStart');
  assert.equal(rows('', '2026-10-01').notes[0].code, 'noDates');
  assert.equal(rows('2026-10-01', '2026-10-31', 'day', { days: [] }).notes[0].code, 'noDays');
  assert.equal(C.monthEnd('2026-10-01'), '2026-10-31');
  assert.equal(C.monthEnd('2027-01-31'), '2027-02-27');
  assert.equal(C.monthEnd('2026-12-15'), '2027-01-14');
  const long = C.dutyRows({ start: '2026-01-01', end: '2027-12-31', unit: 'day', days: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(long.rows.length, 200);
  assert.ok(long.notes.some((n) => n.code === 'rangeCut') && long.notes.some((n) => n.code === 'tooManyRows'));
});

test('担当できない日: 日付・曜日・名簿に無い名前・読めないもの', () => {
  const u = C.parseUnavail('青木: 10/3, 10月17日、水\n井上：金曜\n誰か: 10/1\n上田 10/1\n江藤: あした', ['青木', '井上', '上田', '江藤']);
  assert.deepEqual(u.map['青木'], { dates: { '10/3': 1, '10/17': 1 }, days: { 3: 1 } });
  assert.deepEqual(u.map['井上'], { dates: {}, days: { 5: 1 } });
  assert.deepEqual(u.unknown, ['誰か']);
  assert.deepEqual(u.bad, ['上田 10/1', 'あした']);
});

test('割り当て: ハンガリー法が総当たりと同じ最小', () => {
  const rng = C.makeRng(5);
  for (let t = 0; t < 40; t++) {
    const n = rng.int(1, 4), m = rng.int(n, 6);
    const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => rng.int(0, 20)));
    const pick = C.assignMin(cost, n, m);
    assert.equal(new Set(pick).size, n);
    const got = pick.reduce((s, c, i) => s + cost[i][c], 0);
    let best = Infinity;
    (function rec(i, used, s) {
      if (i === n) { best = Math.min(best, s); return; }
      for (let c = 0; c < m; c++) if (!used[c]) { used[c] = 1; rec(i + 1, used, s + cost[i][c]); used[c] = 0; }
    })(0, [], 0);
    assert.equal(got, best);
  }
});

test('当番表: 名簿の順に回す（1 種類 1 人）', () => {
  const names = ['青木', '井上', '上田', '江藤', '小川'];
  const r = C.makeRoster({ people: names, duties: [{ name: '日直', k: 1 }], rows: rows('2026-10-01', '2026-10-31').rows, order: 'turn' }, 1);
  const seq = r.table.map((c) => c[0][0]);
  seq.forEach((p, i) => assert.equal(p, i % 5));
  assert.deepEqual(r.counts.map((c) => c.total), [5, 4, 4, 4, 4]);
});

test('当番表: 6 班 × 6 か所の週ごと。名簿の順なら 1 つずつずれ、くじでも 6 週で全部 1 回ずつ', () => {
  const han = ['1班', '2班', '3班', '4班', '5班', '6班'];
  const duties = ['教室', '廊下', '階段', 'トイレ', '黒板', 'ゴミ'].map((name) => ({ name, k: 1 }));
  const w = rows('2026-10-05', '2026-11-15', 'week').rows;
  assert.equal(w.length, 6);
  const t = C.makeRoster({ people: han, duties, rows: w, order: 'turn' }, 1);
  t.table.forEach((cells, wi) => cells.forEach((c, di) => assert.equal(c[0], (di - wi + 60) % 6)));
  for (let s = 0; s < 50; s++) {
    const r = C.makeRoster({ people: han, duties, rows: w, order: 'lottery' }, s);
    r.counts.forEach((c) => assert.deepEqual(c.per, [1, 1, 1, 1, 1, 1], 'seed ' + s));
  }
});

test('当番表: 性質（回数の差は 1 回まで・同じ日に 2 つしない・続けない・担当できない日）', () => {
  const rng = C.makeRng(77);
  for (let t = 0; t < 60; t++) {
    const P = rng.int(3, 30);
    const names = Array.from({ length: P }, (_, i) => 'p' + i);
    const D = rng.int(1, 4);
    const duties = Array.from({ length: D }, (_, i) => ({ name: 'd' + i, k: rng.int(1, 2) }));
    const S = duties.reduce((s, d) => s + d.k, 0);
    if (S > P) continue;
    const rr = rows('2026-10-01', '2026-12-20', rng.next() < 0.5 ? 'day' : 'week').rows;
    const order = rng.next() < 0.5 ? 'turn' : 'lottery';
    const r = C.makeRoster({ people: names, duties, rows: rr, order }, t);
    assert.equal(r.empty.length, 0);
    assert.ok(C.countSpread(r.counts) <= 1, 'spread ' + t);
    r.table.forEach((cells, ri) => {
      const all = cells.flat();
      assert.equal(new Set(all).size, all.length);
      cells.forEach((c, di) => assert.equal(c.length, duties[di].k));
      if (ri && P >= 2 * S) {
        const prev = new Set(r.table[ri - 1].flat());
        all.forEach((p) => assert.ok(!prev.has(p), 'consecutive t=' + t + ' row ' + ri));
      }
    });
    // 同じ種類の当番の回数も、差は 1 回までに近い（2 回まで）
    duties.forEach((_, di) => {
      const per = r.counts.map((c) => c.per[di]);
      assert.ok(Math.max(...per) - Math.min(...per) <= 2, 'per ' + t);
    });
  }
  const names = ['青木', '井上', '上田', '江藤', '小川'];
  const rr = rows('2026-10-01', '2026-10-31').rows;
  const un = C.parseUnavail('青木: 水, 10/2\n井上: 10/5', names).map;
  for (let s = 0; s < 20; s++) {
    const r = C.makeRoster({ people: names, duties: [{ name: '給食', k: 2 }], rows: rr, order: 'lottery', unavail: un }, s);
    r.table.forEach((cells, ri) => {
      const d = C.parseYmd(rr[ri].from);
      const who = cells[0].map((i) => names[i]);
      if (d.getUTCDay() === 3 || rr[ri].from === '2026-10-02') assert.ok(!who.includes('青木'));
      if (rr[ri].from === '2026-10-05') assert.ok(!who.includes('井上'));
    });
    assert.ok(C.countSpread(r.counts) <= 1);
  }
});

test('当番表: 人が足りない・全員が担当できない日は空ける', () => {
  const rr = rows('2026-10-01', '2026-10-09').rows;
  const r = C.makeRoster({ people: ['a', 'b'], duties: [{ name: 'x', k: 3 }], rows: rr, order: 'turn' }, 1);
  assert.deepEqual(r.notes, [{ code: 'notEnoughPeople', need: 3, have: 2 }]);
  assert.equal(r.empty.length, rr.length);
  const u = C.parseUnavail('a: 木\nb: 木', ['a', 'b']).map;
  const r2 = C.makeRoster({ people: ['a', 'b'], duties: [{ name: 'x', k: 1 }], rows: rr, order: 'turn', unavail: u }, 1);
  assert.deepEqual(r2.table[0], [[]]);   // 10/1 は木曜
  assert.equal(r2.empty.length, 2);      // 10/1 と 10/8
});

test('当番表: 週ごとの担当できない日は、その週の当番の日がぜんぶのとき', () => {
  const w = rows('2026-10-05', '2026-10-18', 'week').rows;
  assert.equal(C.unavailableOn({ dates: { '10/5': 1 }, days: {} }, w[0]), false);
  assert.equal(C.unavailableOn({ dates: {}, days: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } }, w[0]), true);
  assert.equal(C.unavailableOn({ dates: { '10/13': 1, '10/14': 1, '10/15': 1, '10/16': 1 }, days: {} }, w[1]), true);   // 10/12 は祝日
});

test('当番表の共有リンク: 既定は名前なし・名前つきの往復・壊れたもの', () => {
  const names = ['青木', '井上', '上田'];
  const duties = [{ name: '日直', k: 1 }, { name: '給食', k: 2 }];
  const settings = { start: '2026-10-01', end: '2026-10-09', unit: 'day', days: WEEKDAYS, skipHolidays: true, order: 'lottery', title: '1組' };
  const r = C.makeRoster({ people: names, duties, rows: rows('2026-10-01', '2026-10-09').rows, order: 'lottery' }, 3);
  const h1 = C.encodeDutyShare({ people: names, duties, settings, seed: 3, table: r.table }, false);
  const d1 = C.decodeDutyShare('#s=' + h1);
  assert.equal(d1.people, null);
  assert.equal(d1.settings.title, '');
  assert.deepEqual(d1.table, r.table);
  assert.deepEqual(d1.duties, duties);
  const d2 = C.decodeDutyShare('#s=' + C.encodeDutyShare({ people: names, duties, settings, seed: 3, table: r.table }, true));
  assert.deepEqual(d2.people, names);
  assert.equal(d2.settings.title, '1組');
  assert.deepEqual(C.countTable(d2.table, 3, 2), r.counts);
  assert.equal(C.decodeDutyShare('#s=' + Buffer.from(JSON.stringify({ v: 1, t: 'd', k: 2, d: [] })).toString('base64url')), null);
  const odd = C.decodeDutyShare('#s=' + Buffer.from(JSON.stringify({ v: 1, t: 'd', k: 2, d: [['x', 2]], r: [[[0, 0, 5, 1]]] })).toString('base64url'));
  assert.deepEqual(odd.table, [[[0, 1]]]);
});

test('保存データの正規化', () => {
  const d = C.normalizeDuty({ settings: { start: '2026-02-30', unit: 'month', days: [1, 1, 9, '3'], order: 'x' } });
  assert.equal(d.settings.start, '');
  assert.equal(d.settings.unit, 'day');
  assert.deepEqual(d.settings.days, [1, 3]);
  assert.equal(d.settings.order, 'turn');
  assert.equal(d.settings.skipHolidays, true);
  assert.deepEqual(C.normalizeDuty(null).settings.days, WEEKDAYS);
});

test('画面の文: 当番表の知らせにはすべて文がある', () => {
  ['tooManyDuties', 'notEnoughPeople', 'noDates', 'endBeforeStart', 'rangeCut', 'tooManyRows', 'noDays', 'noRows'].forEach((c) => {
    const t = TEXT.duty[c];
    assert.ok(typeof t === 'function' ? t({ max: 1, need: 2, have: 1, days: 400 }).length : t.length, c);
  });
  assert.equal(TEXT.duty.unitState({ unit: 'week', days: [1, 2, 3, 4, 5], skipHolidays: true, order: 'lottery' }), '週ごと・平日・祝日を除く・くじ');
});

test('祝日: 内閣府の CSV から写した 2025〜2027 年の 54 日・確認日', () => {
  const keys = Object.keys(K.HOLIDAYS);
  assert.equal(keys.length, 54);
  keys.forEach((k) => assert.ok(C.parseYmd(k), k));
  assert.equal(keys.filter((k) => k.startsWith('2026')).length, 18);
  assert.equal(K.HOLIDAYS['2026-09-22'], '休日');
  assert.equal(K.HOLIDAYS['2027-03-22'], '休日');
  assert.match(K.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(K.SOURCE.url.startsWith('https://www8.cao.go.jp/'));
  assert.deepEqual(K.HOLIDAY_YEARS, { from: 2025, to: 2027 });
});
