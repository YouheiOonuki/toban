// ===========================
// 当番表・グループ分けのロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
//
// 画面に出す文はここに書かない。理由などは { code, ... } で返し、文にするのは text.js の TEXT
// 同じ「くじ番号（seed）」・同じ入力からは、いつでも同じ結果になる（Math.random を使わない）
// ===========================
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // 乱数（seed つき）。席替え・学習プリントと同じもの
  // ---------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mixSeed(seed, salt) {
    var h = ((seed >>> 0) ^ Math.imul((salt | 0) + 1, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function makeRng(seed, salt) {
    var r = mulberry32(mixSeed(seed, salt || 0));
    return {
      next: r,
      int: function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); },
      shuffle: function (a) {
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }
  /** くじ番号（seed を 5 桁-5 桁で。口で伝えやすい形） */
  function seedLabel(seed) {
    var s = String(seed >>> 0).padStart(10, '0');
    return s.slice(0, 5) + '-' + s.slice(5);
  }
  /** "01234-56789" や全角の数字を seed に戻す。読めなければ null */
  function parseSeedLabel(s) {
    var d = String(s == null ? '' : s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^0-9]/g, '');
    if (!d || d.length > 10) return null;
    var n = Number(d);
    return n <= 4294967295 ? n : null;
  }

  // ---------------------------------------------------------------
  // 正規化の小道具
  // ---------------------------------------------------------------
  function intIn(v, lo, hi, dflt) {
    var n = Math.round(Number(v));
    return isFinite(n) && v !== null && v !== '' && v !== undefined ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  function str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max); }
  function line1(v, max) { return str(String(v == null ? '' : v).replace(/\n/g, ' '), max); }
  function oneOf(v, list, dflt) { return list.indexOf(v) >= 0 ? v : dflt; }
  function toHalf(s) {
    return String(s).replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }

  var LIMITS = { people: 300, nameLen: 30, duties: 12, dutyLen: 16, perDuty: 10, dates: 200, history: 10, groups: 50, sets: 60, textLen: 20000 };

  // ---------------------------------------------------------------
  // 名簿
  //   1 行 1 人。性別は「名前,男」「名前<TAB>女」「名前（男）」（男・女・男子・女子・M・F・male・female・♂・♀）
  //   ★（☆）を付けた人は「各班に分けたい人」（班長の候補など）
  //   同じ名前の人は ② ③ … を付けて区別する（条件で名前を選ぶため）
  // ---------------------------------------------------------------
  var G_MALE = /^(男|男子|男性|m|male|boy|♂)$/i, G_FEMALE = /^(女|女子|女性|f|female|girl|♀)$/i;
  var CIRCLED = '②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function genderOf(tok) {
    tok = String(tok || '').trim();
    if (G_MALE.test(tok)) return 'M';
    if (G_FEMALE.test(tok)) return 'F';
    return '';
  }
  /** @returns {{ people: {name, g, star}[], notes: {code, ...}[] }} */
  function parsePeople(text) {
    var people = [], notes = [], seen = {}, dup = [], cut = 0;
    String(text || '').slice(0, LIMITS.textLen).split(/\r?\n/).forEach(function (line) {
      var raw = line.replace(/　/g, ' ').trim();
      var star = /[★☆]/.test(raw);
      raw = raw.replace(/[★☆]/g, '').trim();
      if (!raw) return;
      var name = raw, g = '';
      var m = /^(.*?)\s*[,，、\t/／]\s*([^,，、\t/／]*)$/.exec(raw);
      var p = /^(.*?)\s*[(（]\s*([^)）]*?)\s*[)）]$/.exec(raw);
      if (m && m[1] && genderOf(m[2])) { name = m[1]; g = genderOf(m[2]); }
      else if (p && p[1] && genderOf(p[2])) { name = p[1]; g = genderOf(p[2]); }
      else if (m && m[1] && !m[2]) name = m[1];      // 「名前,」
      name = line1(name, LIMITS.nameLen);
      if (!name) return;
      if (people.length >= LIMITS.people) { cut++; return; }
      if (seen[name]) {
        var n = seen[name]++;
        var alt = name + (CIRCLED[n - 1] || '(' + (n + 1) + ')');
        while (seen[alt]) alt += '*';
        seen[alt] = 1;
        if (dup.indexOf(name) < 0) dup.push(name);
        name = alt;
      } else seen[name] = 1;
      people.push({ name: name, g: g, star: star });
    });
    if (dup.length) notes.push({ code: 'dupNames', names: dup });
    if (cut) notes.push({ code: 'tooManyLines', max: LIMITS.people, cut: cut });
    return { people: people, notes: notes };
  }
  /** 番号だけの名簿（1, 2, …, n） */
  function numberPeople(n) {
    var out = [];
    for (var i = 1; i <= intIn(n, 0, LIMITS.people, 0); i++) out.push({ name: String(i), g: '', star: false });
    return out;
  }

  /**
   * 「この人たちは別の班」「同じ班」の欄。1 行に 1 組、名前を「、」「,」「/」「・」で区切る
   * 名簿に無い名前は外して知らせる。2 人未満の行は使わない
   * @returns {{ sets: string[][], unknown: string[] }}
   */
  function parseSets(text, names) {
    var known = {}, sets = [], unknown = [];
    (names || []).forEach(function (n) { known[n] = 1; });
    String(text || '').slice(0, LIMITS.textLen).split(/\r?\n/).forEach(function (line) {
      if (sets.length >= LIMITS.sets) return;
      var got = [];
      line.replace(/　/g, ' ').split(/[,，、\t/／・]+/).forEach(function (tok) {
        var n = line1(tok, LIMITS.nameLen);
        if (!n) return;
        if (!known[n]) { if (unknown.indexOf(n) < 0) unknown.push(n); return; }
        if (got.indexOf(n) < 0) got.push(n);
      });
      if (got.length >= 2) sets.push(got);
    });
    return { sets: sets, unknown: unknown };
  }

  // ---------------------------------------------------------------
  // グループ分け
  // ---------------------------------------------------------------
  /**
   * 班の人数の並び。どの班も人数の差は 1 人まで（多い班が先）
   *   by 'count': n 班に分ける / by 'size': 1 班 n 人を目安に、班の数は 人数÷n の切り上げ
   */
  function groupSizes(total, by, n) {
    total = Math.max(0, total | 0);
    n = intIn(n, 1, LIMITS.people, 1);
    if (!total) return [];
    var g = by === 'size' ? Math.ceil(total / n) : Math.min(n, total);
    g = Math.min(g, LIMITS.groups);
    var base = Math.floor(total / g), extra = total % g, out = [];
    for (var i = 0; i < g; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  function pairKey(a, b) { return a < b ? a + '\n' + b : b + '\n' + a; }
  /** 前に決めた班分け（名前の配列の配列）から「同じ班だった 2 人」の表 */
  function pairTable(groupings) {
    var t = {};
    (groupings || []).forEach(function (gs) {
      (gs || []).forEach(function (g) {
        for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) t[pairKey(g[i], g[j])] = 1;
      });
    });
    return t;
  }
  /** 班分けの中で、前と同じ班になった 2 人の数 */
  function countRepeats(groups, prevGroupings) {
    var t = pairTable(prevGroupings), n = 0;
    (groups || []).forEach(function (g) {
      for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) if (t[pairKey(g[i], g[j])]) n++;
    });
    return n;
  }

  /**
   * 班を作る
   * @param {object} input
   *   people: [{name, g, star}]  名簿（この順が班の中の並び順になる）
   *   by: 'count'|'size', n       班の数 or 1 班の人数
   *   gender: bool                男女の数を班ごとにそろえる（差は 1 人まで）
   *   star: bool                  ★の人を班ごとにそろえる（差は 1 人まで）
   *   apart: [[名前…]]            同じ行の人はみんな別の班
   *   together: [[名前…]]         同じ行の人はみんな同じ班
   *   prev: [[[名前…]…]]          前に決めた班分け（あれば、同じ班だった 2 人をなるべく離す）
   * @param {number} seed
   * @returns {{ ok, groups: string[][], sizes, violations: {code,...}[], repeats, pre: {code,...}[] }}
   *
   * 決め方: 「同じ班」の人を 1 つのまとまりにし、大きいまとまりから空きの多い班へ入れる（同じ大きさはくじの順）。
   *   そのあと、まとまりの入れ替え・移動をくじで試し、守れていない条件の数（人数・別の班・男女と★の差）が
   *   減るものを取る（焼きなまし）。条件をすべて守れたら、前と同じ班だった 2 人の数を減らす。
   *   試す回数は人数で決まっていて、時間では打ち切らない（同じ seed なら、どの端末でも同じ結果）
   */
  function makeGroups(input, seed) {
    var people = input.people || [];
    var N = people.length;
    var sizes = groupSizes(N, input.by, input.n);
    var G = sizes.length;
    var res = { ok: false, groups: [], sizes: sizes, violations: [], repeats: 0, pre: [] };
    if (!N) { res.pre.push({ code: 'noPeople' }); return res; }

    var idx = {};
    people.forEach(function (p, i) { idx[p.name] = i; });
    // 同じ班にする人をまとめる（union-find）
    var parent = people.map(function (_, i) { return i; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    (input.together || []).forEach(function (set) {
      var ids = set.map(function (n) { return idx[n]; }).filter(function (x) { return x !== undefined; });
      for (var i = 1; i < ids.length; i++) { var a = find(ids[0]), b = find(ids[i]); if (a !== b) parent[b] = a; }
    });
    var unitOf = [], units = [], unitIdx = {};
    people.forEach(function (_, i) {
      var r = find(i);
      if (unitIdx[r] === undefined) { unitIdx[r] = units.length; units.push([]); }
      units[unitIdx[r]].push(i);
      unitOf[i] = unitIdx[r];
    });
    var apart = (input.apart || []).map(function (set) {
      return set.map(function (n) { return idx[n]; }).filter(function (x) { return x !== undefined; });
    }).filter(function (s) { return s.length >= 2; });

    // 数でわかる矛盾（先に知らせる。探すのはそのまま続ける）
    var maxSize = Math.max.apply(null, sizes);
    units.forEach(function (u) {
      if (u.length > maxSize) res.pre.push({ code: 'togetherTooBig', names: u.map(function (i) { return people[i].name; }), size: u.length, max: maxSize });
    });
    apart.forEach(function (s) {
      if (s.length > G) res.pre.push({ code: 'apartTooMany', names: s.map(function (i) { return people[i].name; }), groups: G });
      for (var i = 0; i < s.length; i++) for (var j = i + 1; j < s.length; j++) {
        if (unitOf[s[i]] === unitOf[s[j]]) res.pre.push({ code: 'apartAndTogether', a: people[s[i]].name, b: people[s[j]].name });
      }
    });

    var attrs = [];
    if (input.gender) {
      attrs.push(function (p) { return p.g === 'M'; });
      attrs.push(function (p) { return p.g === 'F'; });
    }
    if (input.star) attrs.push(function (p) { return !!p.star; });
    var attrOf = people.map(function (p) { return attrs.map(function (a) { return a(p) ? 1 : 0; }); });
    var prevPairs = [];   // [i, j]（前に同じ班だった 2 人）
    if (input.prev && input.prev.length) {
      var prevT = pairTable(input.prev);
      for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
        if (prevT[pairKey(people[i].name, people[j].name)]) prevPairs.push([i, j]);
      }
    }

    // 状態（人の班・班ごとの人数・属性の数・別の班の組ごとの数）を持ち、1 人ずつ動かすたびに差分で直す
    var K = attrs.length;
    var partners = people.map(function () { return []; });
    prevPairs.forEach(function (pr) { partners[pr[0]].push(pr[1]); partners[pr[1]].push(pr[0]); });
    var apartOf = people.map(function () { return []; });
    apart.forEach(function (set, si) { set.forEach(function (p) { apartOf[p].push(si); }); });
    var st;
    function load(gOf) {
      st = { gOf: gOf, n: new Array(G).fill(0), a: [], ac: apart.map(function () { return new Array(G).fill(0); }), apartBad: 0, soft: 0 };
      for (var k = 0; k < K; k++) st.a.push(new Array(G).fill(0));
      for (var p = 0; p < N; p++) {
        var g = gOf[p];
        st.n[g]++;
        for (k = 0; k < K; k++) st.a[k][g] += attrOf[p][k];
        apartOf[p].forEach(function (si) { if (st.ac[si][g]++ >= 1) st.apartBad++; });
      }
      prevPairs.forEach(function (pr) { if (gOf[pr[0]] === gOf[pr[1]]) st.soft++; });
    }
    function move(p, to) {
      var from = st.gOf[p];
      if (from === to) return;
      var q, k;
      for (q = 0; q < partners[p].length; q++) {
        var o = st.gOf[partners[p][q]];
        if (o === from) st.soft--; else if (o === to) st.soft++;
      }
      st.gOf[p] = to;
      st.n[from]--; st.n[to]++;
      for (k = 0; k < K; k++) { st.a[k][from] -= attrOf[p][k]; st.a[k][to] += attrOf[p][k]; }
      for (q = 0; q < apartOf[p].length; q++) {
        var ac = st.ac[apartOf[p][q]];
        if (--ac[from] >= 1) st.apartBad--;
        if (ac[to]++ >= 1) st.apartBad++;
      }
    }
    function score() {
      var hard = st.apartBad * 2, g, k;
      for (g = 0; g < G; g++) hard += Math.abs(st.n[g] - sizes[g]) * 4;
      for (k = 0; k < K; k++) {
        var lo = Infinity, hi = -Infinity, row = st.a[k];
        for (g = 0; g < G; g++) { if (row[g] < lo) lo = row[g]; if (row[g] > hi) hi = row[g]; }
        if (hi - lo > 1) hard += hi - lo - 1;
      }
      return { hard: hard, soft: st.soft, score: hard * 100000 + st.soft };
    }

    // はじめの並べ方: 大きいまとまりから、入る班のうち「その人と同じ属性（男女・★）の割合が低い班」へ（同じならくじ）
    function initial(rng) {
      var order = rng.shuffle(units.map(function (_, u) { return u; }));
      order.sort(function (x, y) { return units[y].length - units[x].length; });   // sort は安定なので、同じ大きさはくじの順
      var room = sizes.slice(), cnt = [], gOf = [];
      for (var k = 0; k < K; k++) cnt.push(new Array(G).fill(0));
      order.forEach(function (u) {
        var need = attrs.map(function (_, k) { return units[u].reduce(function (s, p) { return s + attrOf[p][k]; }, 0); });
        var best = -1, bestKey = null;
        rng.shuffle(sizes.map(function (_, g) { return g; })).forEach(function (g) {
          var fits = room[g] >= units[u].length ? 0 : 1;
          var load = 0;
          for (var k = 0; k < K; k++) if (need[k]) load += cnt[k][g] / sizes[g];
          var key = [fits, load, -room[g]];
          if (best < 0 || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] - 1e-9 || (Math.abs(key[1] - bestKey[1]) < 1e-9 && key[2] < bestKey[2])))) { best = g; bestKey = key; }
        });
        units[u].forEach(function (p) { gOf[p] = best; });
        room[best] -= units[u].length;
        for (var k2 = 0; k2 < K; k2++) cnt[k2][best] += need[k2];
      });
      return gOf;
    }

    var U = units.length;
    var iters = Math.min(80000, 4000 + 200 * N);
    var best = null;
    function place(u, g) { for (var q = 0; q < units[u].length; q++) move(units[u][q], g); }
    for (var round = 0; round < 6; round++) {
      var rng = makeRng(seed, round + 1);
      load(initial(rng));
      var cur = score();
      var temp = 2;
      for (var it = 0; it < iters && G > 1 && U > 1; it++) {
        if (cur.score === 0) break;
        if (it % 500 === 499) temp = Math.max(0.05, temp * 0.8);
        var u = rng.int(0, U - 1), gu = st.gOf[units[u][0]], v = -1, gv = -1;
        if (rng.next() < 0.8) {
          v = rng.int(0, U - 1); gv = st.gOf[units[v][0]];
          if (gv === gu) continue;
          place(u, gv); place(v, gu);
        } else {
          gv = rng.int(0, G - 1);
          if (gv === gu) continue;
          place(u, gv);
        }
        var nx = score();
        var d = nx.score - cur.score;
        if (d <= 0 || rng.next() < Math.exp(-d / temp)) cur = nx;
        else { place(u, gu); if (v >= 0) place(v, gv); }
      }
      if (!best || cur.score < best.score) best = { score: cur.score, hard: cur.hard, soft: cur.soft, gOf: st.gOf.slice() };
      if (best.hard === 0 && (best.soft === 0 || round >= 1)) break;
    }

    // 班ごとに名簿の順で並べる。班の順は、班の中でいちばん名簿の上の人の順（1 番の人は 1 班）
    var groups = [];
    for (var g = 0; g < G; g++) groups.push([]);
    for (var p = 0; p < N; p++) groups[best.gOf[p]].push(p);
    groups = groups.filter(function (x) { return x.length; });
    groups.sort(function (x, y) { return x[0] - y[0]; });
    res.groups = groups.map(function (x) { return x.map(function (q) { return people[q].name; }); });
    res.violations = checkGroups(input, res.groups);
    res.repeats = input.prev && input.prev.length ? countRepeats(res.groups, input.prev) : 0;
    res.ok = !res.violations.length;
    return res;
  }

  /** できた班が条件を守っているか（受け取った共有リンクの班にも使う） */
  function checkGroups(input, groups) {
    var people = input.people || [], gOf = {}, byName = {}, out = [];
    people.forEach(function (p) { byName[p.name] = p; });
    groups.forEach(function (g, i) { g.forEach(function (n) { gOf[n] = i; }); });
    var sizes = groupSizes(people.length, input.by, input.n);
    var got = groups.map(function (g) { return g.length; }).sort(function (a, b) { return b - a; });
    if (got.join() !== sizes.join()) out.push({ code: 'sizeBroken', sizes: got });
    (input.apart || []).forEach(function (s) {
      for (var i = 0; i < s.length; i++) for (var j = i + 1; j < s.length; j++) {
        if (gOf[s[i]] !== undefined && gOf[s[i]] === gOf[s[j]]) out.push({ code: 'apartBroken', a: s[i], b: s[j], group: gOf[s[i]] + 1 });
      }
    });
    (input.together || []).forEach(function (s) {
      var gs = {};
      s.forEach(function (n) { if (gOf[n] !== undefined) gs[gOf[n]] = 1; });
      if (Object.keys(gs).length > 1) out.push({ code: 'togetherBroken', names: s });
    });
    function spread(key, has) {
      var c = groups.map(function (g) { return g.filter(function (n) { return byName[n] && has(byName[n]); }).length; });
      var lo = Math.min.apply(null, c), hi = Math.max.apply(null, c);
      if (hi - lo > 1) out.push({ code: 'balanceBroken', key: key, counts: c });
    }
    if (groups.length > 1) {
      if (input.gender) {
        spread('M', function (p) { return p.g === 'M'; });
        spread('F', function (p) { return p.g === 'F'; });
      }
      if (input.star) spread('star', function (p) { return !!p.star; });
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 当番表
  // ---------------------------------------------------------------
  /**
   * 当番の種類。1 行 1 つ、「黒板 2」「黒板,2」「黒板×2」「黒板 2人」で 1 回あたりの人数
   * @returns {{ duties: {name, k}[], notes }}
   */
  function parseDuties(text) {
    var duties = [], notes = [], seen = {};
    String(text || '').slice(0, LIMITS.textLen).split(/\r?\n/).forEach(function (line) {
      var raw = toHalf(line.replace(/　/g, ' ')).trim();
      if (!raw) return;
      var k = 1, name = raw;
      var m = /^(.*?)[\s,，、:：×xX*]*(\d{1,2})\s*(人|名)?$/.exec(raw);
      if (m && m[1].trim()) { name = m[1]; k = Number(m[2]); }
      name = line1(name.replace(/[,，、:：×]+$/, ''), LIMITS.dutyLen);
      if (!name || seen[name]) return;
      if (duties.length >= LIMITS.duties) { if (!notes.length) notes.push({ code: 'tooManyDuties', max: LIMITS.duties }); return; }
      seen[name] = 1;
      duties.push({ name: name, k: Math.min(LIMITS.perDuty, Math.max(1, k)) });
    });
    return { duties: duties, notes: notes };
  }

  function ymd(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return ymd(d) === s ? d : null;
  }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  /** 開始日から 1 か月後の前日（10/1 → 10/31、1/31 → 2/28） */
  function monthEnd(start) {
    var d = parseYmd(start);
    if (!d) return '';
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return ymd(addDays(new Date(Date.UTC(y, m, Math.min(day, last))), -1));
  }

  /**
   * 当番の日（行）の一覧
   * @param {object} o { start, end, unit: 'day'|'week', days: [0-6]（日=0）, skipHolidays, holidays: {'YYYY-MM-DD': 名前} }
   * @returns {{ rows: {key, from, to, dates: string[]}[], skipped: {date, name}[], notes }}
   *   日ごと: 1 行 1 日。週ごと: 月曜はじまりの 1 週で 1 行（範囲の中の当番の曜日だけ。祝日を除いて 1 日も残らない週は行にしない）
   */
  function dutyRows(o) {
    var notes = [], rows = [], skipped = [];
    var s = parseYmd(o.start), e = parseYmd(o.end);
    if (!s || !e) return { rows: rows, skipped: skipped, notes: [{ code: 'noDates' }] };
    if (e < s) return { rows: rows, skipped: skipped, notes: [{ code: 'endBeforeStart' }] };
    var days = (o.days || []).filter(function (x) { return x >= 0 && x <= 6; });
    var hol = o.skipHolidays ? (o.holidays || {}) : {};
    if ((e - s) / 86400000 > 400) { e = addDays(s, 400); notes.push({ code: 'rangeCut', days: 400 }); }
    function ok(d) {
      if (days.indexOf(d.getUTCDay()) < 0) return false;
      if (hol[ymd(d)]) { skipped.push({ date: ymd(d), name: hol[ymd(d)] }); return false; }
      return true;
    }
    var d, full = false;
    if (o.unit === 'week') {
      var mon = addDays(s, -((s.getUTCDay() + 6) % 7));
      for (var w = mon; w <= e && !full; w = addDays(w, 7)) {
        var ds = [];
        for (var i = 0; i < 7; i++) {
          d = addDays(w, i);
          if (d >= s && d <= e && ok(d)) ds.push(ymd(d));
        }
        if (ds.length) rows.push({ key: ds[0], from: ds[0], to: ds[ds.length - 1], dates: ds });
        full = rows.length >= LIMITS.dates;
      }
    } else {
      for (d = s; d <= e && !full; d = addDays(d, 1)) {
        if (!ok(d)) continue;
        rows.push({ key: ymd(d), from: ymd(d), to: ymd(d), dates: [ymd(d)] });
        full = rows.length >= LIMITS.dates;
      }
    }
    if (full && d <= e) notes.push({ code: 'tooManyRows', max: LIMITS.dates });
    if (!days.length) notes.push({ code: 'noDays' });
    else if (!rows.length) notes.push({ code: 'noRows' });
    return { rows: rows, skipped: skipped, notes: notes };
  }

  /**
   * 担当できない日。1 行 1 人「名前: 10/3, 10/17, 水」（日付は 月/日、曜日は 月〜日）
   * @returns {{ map: {名前: {dates: {'M/D':1}, days: {0-6:1}}}, unknown: string[], bad: string[] }}
   */
  var WD = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
  function parseUnavail(text, names) {
    var known = {}, map = {}, unknown = [], bad = [];
    (names || []).forEach(function (n) { known[n] = 1; });
    String(text || '').slice(0, LIMITS.textLen).split(/\r?\n/).forEach(function (line) {
      var raw = toHalf(line.replace(/　/g, ' ')).trim();
      if (!raw) return;
      var m = /^(.+?)\s*[:：]\s*(.*)$/.exec(raw);
      if (!m) { bad.push(raw.slice(0, 40)); return; }
      var name = line1(m[1], LIMITS.nameLen);
      if (!known[name]) { if (unknown.indexOf(name) < 0) unknown.push(name); return; }
      var ent = map[name] || (map[name] = { dates: {}, days: {} });
      m[2].split(/[\s,，、]+/).forEach(function (tok) {
        if (!tok) return;
        var dm = /^(\d{1,2})[/月](\d{1,2})日?$/.exec(tok);
        var wm = /^([日月火水木金土])(曜日?)?$/.exec(tok);
        if (dm && +dm[1] >= 1 && +dm[1] <= 12 && +dm[2] >= 1 && +dm[2] <= 31) ent.dates[+dm[1] + '/' + +dm[2]] = 1;
        else if (wm) ent.days[WD[wm[1]]] = 1;
        else bad.push(tok.slice(0, 20));
      });
    });
    return { map: map, unknown: unknown, bad: bad };
  }
  /** その行（日・週）に担当できないか。週ごとの行は、その週の当番の日がぜんぶ担当できない日なら「できない」 */
  function unavailableOn(ent, row) {
    if (!ent) return false;
    return row.dates.every(function (ds) {
      var d = parseYmd(ds);
      return !!(ent.dates[(d.getUTCMonth() + 1) + '/' + d.getUTCDate()] || ent.days[d.getUTCDay()]);
    });
  }

  /**
   * 割り当て問題（コストの合計が最小。行 ≤ 列）。ハンガリー法 O(n^2 m)
   * @returns {number[]} 行ごとに選んだ列
   */
  function assignMin(cost, n, m) {
    var INF = Infinity, u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
    for (var i = 1; i <= n; i++) {
      p[0] = i;
      var j0 = 0, minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
      do {
        used[j0] = true;
        var i0 = p[j0], delta = INF, j1 = 0, j;
        for (j = 1; j <= m; j++) {
          if (used[j]) continue;
          var cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jj = way[j0]; p[j0] = p[jj]; j0 = jj; } while (j0);
    }
    var ans = new Array(n);
    for (var c = 1; c <= m; c++) if (p[c]) ans[p[c] - 1] = c - 1;
    return ans;
  }

  /**
   * 当番表を作る
   * @param {object} input
   *   people: string[]            担当する人（または班）。この順が「順番に回す」の順
   *   duties: {name, k}[]         当番の種類と 1 回あたりの人数
   *   rows: dutyRows の rows
   *   order: 'turn'|'lottery'     名簿の順に回す / くじ（回数はそろえて、順番はくじ）
   *   unavail: parseUnavail の map
   * @param {number} seed
   * @returns {{ table: number[][][]（行 → 当番 → 人の番号）, counts: {total, per: number[]}[], empty: {row, duty}[], notes }}
   *
   * 決め方: 行（日・週）ごとに、その行の枠（当番 × 人数）と人を割り当て問題で結ぶ。コストの重い順に
   *   1) それまでの回数が多い人（回数をそろえる） 2) すぐ前の行にも当番だった人（続けない）
   *   3) その当番をしたことが多い人（当番の種類を回す） 4) 順番: 前の当番の次の当番・名簿の順／くじ: 乱数
   *   担当できない人はその行の枠に入れない。1 人が同じ行で 2 つの当番はしない
   */
  function makeRoster(input, seed) {
    var people = input.people || [], duties = input.duties || [], rows = input.rows || [];
    var P = people.length, D = duties.length, notes = [];
    var counts = people.map(function () { return { total: 0, per: duties.map(function () { return 0; }) }; });
    var table = [], empty = [], slots = [];
    duties.forEach(function (d, di) { for (var k = 0; k < d.k; k++) slots.push(di); });
    var S = slots.length;
    if (!P || !D || !rows.length) return { table: table, counts: counts, empty: empty, notes: notes };
    if (S > P) notes.push({ code: 'notEnoughPeople', need: S, have: P });
    var rng = makeRng(seed, 7);
    var lastRow = people.map(function () { return -9; }), lastDuty = people.map(function () { return -1; });
    var turn = input.order !== 'lottery';
    var unav = input.unavail || {};
    var BIG = 1e13;
    rows.forEach(function (row, ri) {
      var avail = people.map(function (name) { return !unavailableOn(unav[name], row); });
      var jitter = people.map(function () { return rng.next(); });
      // 列: 人 P ＋ 空き S（担当できる人が足りないとき、枠を空けるための列）
      var cost = slots.map(function (di) {
        var r = [];
        for (var p = 0; p < P; p++) {
          if (!avail[p]) { r.push(BIG); continue; }
          var c = counts[p].total * 1e8;
          if (lastRow[p] === ri - 1) c += 1e6;
          c += counts[p].per[di] * 1e4;
          if (turn) {
            if (lastDuty[p] >= 0) c += ((di - lastDuty[p] - 1 + D) % D) * 10;
            c += p / P;   // 名簿の順
          } else c += jitter[p] * 9;
          r.push(c);
        }
        for (var e = 0; e < S; e++) r.push(BIG / 10);
        return r;
      });
      var pick = assignMin(cost, S, P + S);
      var cells = duties.map(function () { return []; });
      pick.forEach(function (col, si) {
        if (col >= P || !avail[col]) { empty.push({ row: ri, duty: slots[si] }); return; }
        cells[slots[si]].push(col);
      });
      cells.forEach(function (c, di) {
        c.sort(function (a, b) { return a - b; });
        c.forEach(function (p) { counts[p].total++; counts[p].per[di]++; lastRow[p] = ri; lastDuty[p] = di; });
      });
      table.push(cells);
    });
    return { table: table, counts: counts, empty: empty, notes: notes };
  }

  /** 表から回数を数え直す（共有リンクで受け取った表にも使う） */
  function countTable(table, P, D) {
    var counts = [];
    for (var p = 0; p < P; p++) counts.push({ total: 0, per: new Array(D).fill(0) });
    (table || []).forEach(function (cells) {
      cells.forEach(function (c, di) { c.forEach(function (p) { if (counts[p] && di < D) { counts[p].total++; counts[p].per[di]++; } }); });
    });
    return counts;
  }
  /** 回数のかたより（いちばん多い人と少ない人の差） */
  function countSpread(counts) {
    if (!counts.length) return 0;
    var t = counts.map(function (c) { return c.total; });
    return Math.max.apply(null, t) - Math.min.apply(null, t);
  }

  // ---------------------------------------------------------------
  // 共有リンク #s=（base64url の JSON。# 以降なのでサーバーには送られない）
  // ---------------------------------------------------------------
  function b64uEncode(s) {
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  function readHash(hash) {
    var m = /^#?s=([A-Za-z0-9_-]+)$/.exec(String(hash || '').trim());
    if (!m) return null;
    try { return JSON.parse(b64uDecode(m[1])); } catch (e) { return null; }
  }
  /**
   * 班分けの共有: 班（名簿の何番目か）・くじ番号・見出し。名前は withNames のときだけ（無いときは 1, 2, 3 … で出る）
   * @param st { people: [{name,g,star}], seed, groups: string[][], title }
   */
  function encodeGroupShare(st, withNames) {
    var pos = {};
    st.people.forEach(function (p, i) { pos[p.name] = i; });
    var o = { v: 1, t: 'g', s: st.seed >>> 0, k: st.people.length,
      r: (st.groups || []).map(function (g) { return g.map(function (n) { return pos[n]; }).filter(function (x) { return x !== undefined; }); }) };
    if (withNames) o.p = st.people.map(function (p) { return [p.name, p.g || '', p.star ? 1 : 0]; });
    if (withNames && st.title) o.h = line1(st.title, 40);
    return b64uEncode(JSON.stringify(o));
  }
  function decodeGroupShare(hash) {
    var o = readHash(hash);
    if (!o || o.v !== 1 || o.t !== 'g') return null;
    var k = intIn(o.k, 1, LIMITS.people, 0);
    if (!k) return null;
    var people = null;
    if (Array.isArray(o.p)) {
      people = o.p.slice(0, k).map(function (x) {
        x = Array.isArray(x) ? x : [x];
        return { name: line1(x[0], LIMITS.nameLen), g: x[1] === 'M' || x[1] === 'F' ? x[1] : '', star: !!x[2] };
      });
      var names = {};
      if (people.length !== k || people.some(function (p) { var bad = !p.name || names[p.name]; names[p.name] = 1; return bad; })) return null;
    }
    var list = people || numberPeople(k), used = {}, groups = [];
    (Array.isArray(o.r) ? o.r : []).slice(0, LIMITS.groups).forEach(function (g) {
      var out = [];
      (Array.isArray(g) ? g : []).forEach(function (i) {
        i = Number(i);
        if (Number.isInteger(i) && i >= 0 && i < k && !used[i]) { used[i] = 1; out.push(list[i].name); }
      });
      if (out.length) groups.push(out);
    });
    if (!groups.length) return null;
    return { people: people, count: k, seed: intIn(o.s, 0, 4294967295, 0), groups: groups, title: line1(o.h, 40) };
  }

  /**
   * 当番表の共有: 当番の種類・期間の設定・表（人の番号）。名前は withNames のときだけ（無いときは 1, 2, 3 … で出る）
   * @param st { people: string[], duties, settings, seed, table }
   */
  function encodeDutyShare(st, withNames) {
    var set = normalizeDutySettings(st.settings);
    if (!withNames) set.title = '';
    var o = { v: 1, t: 'd', s: st.seed >>> 0, k: st.people.length, d: st.duties.map(function (d) { return [d.name, d.k]; }), c: set, r: st.table };
    if (withNames) o.p = st.people.slice();
    return b64uEncode(JSON.stringify(o));
  }
  function decodeDutyShare(hash) {
    var o = readHash(hash);
    if (!o || o.v !== 1 || o.t !== 'd') return null;
    var k = intIn(o.k, 1, LIMITS.people, 0);
    if (!k) return null;
    var people = null;
    if (Array.isArray(o.p)) {
      people = o.p.slice(0, k).map(function (x) { return line1(x, LIMITS.nameLen); });
      if (people.length !== k || people.some(function (p) { return !p; })) return null;
    }
    var duties = (Array.isArray(o.d) ? o.d : []).slice(0, LIMITS.duties).map(function (x) {
      return { name: line1(Array.isArray(x) ? x[0] : x, LIMITS.dutyLen), k: intIn(Array.isArray(x) ? x[1] : 1, 1, LIMITS.perDuty, 1) };
    }).filter(function (d) { return d.name; });
    if (!duties.length) return null;
    var table = (Array.isArray(o.r) ? o.r : []).slice(0, LIMITS.dates).map(function (row) {
      var seen = {};
      return duties.map(function (_, di) {
        var c = Array.isArray(row) && Array.isArray(row[di]) ? row[di] : [];
        return c.map(Number).filter(function (i) { var ok = Number.isInteger(i) && i >= 0 && i < k && !seen[i]; seen[i] = 1; return ok; }).slice(0, LIMITS.perDuty);
      });
    });
    return { people: people, count: k, duties: duties, settings: normalizeDutySettings(o.c), seed: intIn(o.s, 0, 4294967295, 0), table: table };
  }

  // ---------------------------------------------------------------
  // 保存するデータの正規化（ブラウザの保存・バックアップ・共有リンクの受け取り）
  // ---------------------------------------------------------------
  function normalizeDutySettings(o) {
    o = o && typeof o === 'object' ? o : {};
    var days = Array.isArray(o.days)
      ? o.days.map(Number).filter(function (x, i, a) { return Number.isInteger(x) && x >= 0 && x <= 6 && a.indexOf(x) === i; }).sort()
      : [1, 2, 3, 4, 5];
    return {
      start: parseYmd(o.start) ? o.start : '',
      end: parseYmd(o.end) ? o.end : '',
      unit: oneOf(o.unit, ['day', 'week'], 'day'),
      days: days,
      skipHolidays: o.skipHolidays === undefined ? true : !!o.skipHolidays,
      order: oneOf(o.order, ['turn', 'lottery'], 'turn'),
      title: line1(o.title, 40),
    };
  }
  function normalizeDuty(o) {
    o = o && typeof o === 'object' ? o : {};
    return {
      people: String(o.people == null ? '' : o.people).slice(0, LIMITS.textLen),
      duties: String(o.duties == null ? '' : o.duties).slice(0, 2000),
      unavail: String(o.unavail == null ? '' : o.unavail).slice(0, 4000),
      settings: normalizeDutySettings(o.settings),
      seed: intIn(o.seed, 0, 4294967295, 0),
      credit: o.credit === undefined ? true : !!o.credit,
      counts: o.counts === undefined ? true : !!o.counts,
    };
  }
  function normalizeGroupsList(gs) {
    return (Array.isArray(gs) ? gs : []).slice(0, LIMITS.groups).map(function (g) {
      return (Array.isArray(g) ? g : []).slice(0, LIMITS.people).map(function (n) { return line1(n, LIMITS.nameLen); }).filter(Boolean);
    }).filter(function (g) { return g.length; });
  }
  function normalizeGroup(o) {
    o = o && typeof o === 'object' ? o : {};
    return {
      people: String(o.people == null ? '' : o.people).slice(0, LIMITS.textLen),
      numbers: !!o.numbers,
      count: intIn(o.count, 1, LIMITS.people, 30),
      by: oneOf(o.by, ['count', 'size'], 'count'),
      n: intIn(o.n, 1, LIMITS.people, 6),
      gender: !!o.gender,
      star: !!o.star,
      apart: String(o.apart == null ? '' : o.apart).slice(0, 4000),
      together: String(o.together == null ? '' : o.together).slice(0, 4000),
      avoidPrev: !!o.avoidPrev,
      seed: intIn(o.seed, 0, 4294967295, 0),
      title: line1(o.title, 40),
      credit: o.credit === undefined ? true : !!o.credit,
      history: (Array.isArray(o.history) ? o.history : []).slice(0, LIMITS.history).map(function (h) {
        h = h && typeof h === 'object' ? h : {};
        return { at: line1(h.at, 30), groups: normalizeGroupsList(h.groups) };
      }).filter(function (h) { return h.groups.length; }),
    };
  }
  function addHistory(history, entry) {
    return [entry].concat(history || []).slice(0, LIMITS.history);
  }

  // --- バックアップファイル（README「ツールを追加するとき」20。決定 D31） ---
  var BACKUP_VERSION = 1;
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }
  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は normalizeDuty / normalizeGroup で行う
   * @returns {{ok: true, data: object} | {ok: false, error: string}} error は画面にそのまま出す文
   */
  function parseBackup(text, tool, requiredKeys) {
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') {
      return { ok: false, error: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。' };
    }
    if (o.tool !== tool) {
      return { ok: false, error: 'ほかのツール（' + o.tool.slice(0, 40) + '）のファイルです。このツールで書き出したファイルを選んでください。' };
    }
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, error: typeof o.version === 'number' && o.version > BACKUP_VERSION
        ? '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。'
        : 'ファイルの形式が正しくないため読み込めません。' };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, error: 'ファイルの中身が足りないため読み込めません。' };
    return { ok: true, data: data };
  }

  var api = {
    LIMITS: LIMITS,
    makeRng: makeRng, seedLabel: seedLabel, parseSeedLabel: parseSeedLabel,
    parsePeople: parsePeople, numberPeople: numberPeople, parseSets: parseSets,
    groupSizes: groupSizes, makeGroups: makeGroups, checkGroups: checkGroups, countRepeats: countRepeats,
    parseDuties: parseDuties, dutyRows: dutyRows, parseUnavail: parseUnavail, unavailableOn: unavailableOn,
    makeRoster: makeRoster, countTable: countTable, countSpread: countSpread,
    assignMin: assignMin, monthEnd: monthEnd, parseYmd: parseYmd, ymd: ymd,
    encodeGroupShare: encodeGroupShare, decodeGroupShare: decodeGroupShare,
    encodeDutyShare: encodeDutyShare, decodeDutyShare: decodeDutyShare,
    normalizeDuty: normalizeDuty, normalizeDutySettings: normalizeDutySettings, normalizeGroup: normalizeGroup, addHistory: addHistory,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
