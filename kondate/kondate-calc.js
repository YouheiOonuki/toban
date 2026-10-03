// ===========================
// 献立ローテーション表（kondate/）の計算。画面に依存しない。Node（テスト）では module.exports、ブラウザでは window.Kondate
// 乱数は ../calc.js の makeRng（seed つき。同じくじ番号・同じ入力なら同じ表）。レシピは持たない（料理の名前を並べるだけ）
//
// 決め方（1 日ずつ、前から）:
//   1. その曜日に「決まった料理」があればそれ（例: 金曜はカレー）。決まった料理はほかの日には出さない
//   2. ほかは候補の中から、次の順に小さいものを選ぶ
//      a. これまでに出た回数（全部が 1 回出るまで同じ料理は出ない）
//      b. 前の日と同じ種類か（「同じ種類を続けない」が on のとき。肉 → 肉 を避ける）
//      c. （b が on のとき）まだ出ていない料理が多い種類を先に（最後に同じ種類だけが残らないように）
//      d. 最後に出てからの日数が短いか（長く出ていない料理を先に）
//      e. くじ
// ===========================
(function (root) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('../calc.js') : root.Calc;

  var LIMITS = { dishes: 60, nameLen: 20, kindLen: 6, weeks: [1, 2, 3, 4, 5] };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  /** 1 行 1 品「料理名」か「料理名,種類」（区切りは , 、 タブ ／ /）。重複は 1 つに */
  function parseDishes(text) {
    var seen = {}, out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var parts = line.split(/[,，、\t／\/]/);
      var name = parts[0].trim().slice(0, LIMITS.nameLen);
      var kind = (parts[1] || '').trim().slice(0, LIMITS.kindLen);
      if (!name || seen[name] || out.length >= LIMITS.dishes) return;
      seen[name] = 1;
      out.push({ name: name, kind: kind });
    });
    return out;
  }

  /** 決まった日「金: カレー」（1 行 1 つ。曜日は 月〜日） */
  function parseFixed(text) {
    var map = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*([日月火水木金土])(?:曜日?)?\s*[:：]\s*(.+?)\s*$/.exec(line);
      if (m) map[WD.indexOf(m[1])] = m[2].slice(0, LIMITS.nameLen);
    });
    return map;
  }

  /**
   * 献立の表
   * @param {{dishes:Array<{name,kind}>, start:string(YYYY-MM-DD), weeks:number, skipDays:number[], fixed:object, noSameKind:boolean}} o
   * @returns {{weeks: Array<Array<{date:string, w:number, dish:string|null, kind:string, skip:boolean, fixed:boolean}>>, counts: object, notes: string[]}}
   */
  function makeMenu(o, seed) {
    var start = C.parseYmd(o.start);
    var notes = [];
    if (!start) return { weeks: [], counts: {}, notes: ['noStart'] };
    var dishes = o.dishes || [];
    var skip = o.skipDays || [];
    var fixed = o.fixed || {};
    var rng = C.makeRng(seed >>> 0, 7);
    // くじは料理ごとに 1 回だけ引いて、同じ数のときの順番に使う（入力の順が結果を決めないように）
    var tie = dishes.map(function () { return rng.next(); });
    var uses = dishes.map(function () { return 0; });
    var last = dishes.map(function () { return -1e9; });
    var prevKind = '';
    var counts = {};
    var weeks = [];
    var dayIndex = 0;
    var left = {};
    // 決まった日の料理は、ほかの日には出さない
    var fixedNames = {};
    Object.keys(fixed).forEach(function (k) { fixedNames[fixed[k]] = 1; });
    var free = dishes.map(function (d) { return !fixedNames[d.name]; });
    var anyFree = free.some(Boolean);
    if (!dishes.length && !Object.keys(fixed).length) notes.push('noDishes');
    for (var w = 0; w < o.weeks; w++) {
      var row = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(start.getTime() + (w * 7 + i) * 86400000);
        var wd = d.getUTCDay();
        var cell = { date: C.ymd(d), w: wd, dish: null, kind: '', skip: false, fixed: false };
        if (skip.indexOf(wd) >= 0) {
          cell.skip = true; prevKind = '';
        } else if (fixed[wd]) {
          cell.dish = fixed[wd]; cell.fixed = true;
          var fi = indexOfName(dishes, fixed[wd]);
          cell.kind = fi >= 0 ? dishes[fi].kind : '';
          if (fi >= 0) { uses[fi]++; last[fi] = dayIndex; }
          prevKind = cell.kind;
        } else if (anyFree) {
          // 出た回数がいちばん少ない料理の、種類ごとの残りの数（多い種類から先に出すと、最後に同じ種類だけが残りにくい）
          var minUse = Infinity;
          for (var q0 = 0; q0 < dishes.length; q0++) if (free[q0]) minUse = Math.min(minUse, uses[q0]);
          left = {};
          for (var q = 0; q < dishes.length; q++) if (free[q] && uses[q] === minUse) left[dishes[q].kind] = (left[dishes[q].kind] || 0) + 1;
          var best = -1;
          for (var k = 0; k < dishes.length; k++) {
            if (!free[k]) continue;
            if (best < 0 || better(k, best)) best = k;
          }
          cell.dish = dishes[best].name; cell.kind = dishes[best].kind;
          uses[best]++; last[best] = dayIndex; prevKind = cell.kind;
        }
        if (cell.dish) counts[cell.dish] = (counts[cell.dish] || 0) + 1;
        row.push(cell);
        dayIndex++;
      }
      weeks.push(row);
    }
    function sameKind(k) { return o.noSameKind && prevKind !== '' && dishes[k].kind === prevKind ? 1 : 0; }
    function better(a, b) {
      if (uses[a] !== uses[b]) return uses[a] < uses[b];
      var sa = sameKind(a), sb = sameKind(b);
      if (sa !== sb) return sa < sb;
      if (o.noSameKind) {
        var la = dishes[a].kind ? left[dishes[a].kind] || 0 : 0, lb = dishes[b].kind ? left[dishes[b].kind] || 0 : 0;
        if (la !== lb) return la > lb;
      }
      if (last[a] !== last[b]) return last[a] < last[b];
      return tie[a] < tie[b];
    }
    var freeDays = 0;
    weeks.forEach(function (r) { r.forEach(function (c) { if (c.dish && !c.fixed) freeDays++; }); });
    var nFree = free.filter(Boolean).length;
    if (nFree && nFree < freeDays) notes.push('repeat');
    return { weeks: weeks, counts: counts, notes: notes };
  }
  function indexOfName(dishes, name) {
    for (var i = 0; i < dishes.length; i++) if (dishes[i].name === name) return i;
    return -1;
  }

  /** 前の日と同じ種類が続いた回数（テストと画面の注記に使う） */
  function sameKindRuns(weeks) {
    var n = 0, prev = '';
    weeks.forEach(function (r) {
      r.forEach(function (c) {
        if (!c.dish) { prev = ''; return; }
        if (c.kind && c.kind === prev) n++;
        prev = c.kind;
      });
    });
    return n;
  }

  /** 次の月曜（今日が月曜なら今日） */
  function nextMonday(today) {
    var d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    var add = (8 - d.getUTCDay()) % 7;
    return C.ymd(new Date(d.getTime() + add * 86400000));
  }

  var SAMPLE = ['ハンバーグ,肉', '鮭の塩焼き,魚', '肉じゃが,肉', 'さばの味噌煮,魚', '親子丼,卵', 'マーボー豆腐,豆', '焼きそば,麺', '鶏のから揚げ,肉', 'ぶりの照り焼き,魚', 'オムライス,卵', '豚のしょうが焼き,肉', 'カレー,肉'].join('\n');

  function normalize(raw, today) {
    var s = { dishes: SAMPLE, start: nextMonday(today), weeks: 2, skipDays: [], fixed: '', noSameKind: true, seed: 1, memo: true, credit: true, title: '' };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.dishes === 'string') s.dishes = raw.dishes.slice(0, 4000);
    if (C.parseYmd(raw.start)) s.start = raw.start;
    if (LIMITS.weeks.indexOf(Number(raw.weeks)) >= 0) s.weeks = Number(raw.weeks);
    if (Array.isArray(raw.skipDays)) s.skipDays = raw.skipDays.map(Number).filter(function (x, i, a) { return x >= 0 && x <= 6 && Number.isInteger(x) && a.indexOf(x) === i; });
    if (typeof raw.fixed === 'string') s.fixed = raw.fixed.slice(0, 400);
    ['noSameKind', 'memo', 'credit'].forEach(function (k) { if (typeof raw[k] === 'boolean') s[k] = raw[k]; });
    var sd = Number(raw.seed);
    if (Number.isInteger(sd) && sd >= 0 && sd <= 4294967295) s.seed = sd;
    if (typeof raw.title === 'string') s.title = raw.title.slice(0, 40);
    return s;
  }

  var api = { LIMITS: LIMITS, WD: WD, SAMPLE: SAMPLE, parseDishes: parseDishes, parseFixed: parseFixed, makeMenu: makeMenu, sameKindRuns: sameKindRuns, nextMonday: nextMonday, normalize: normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kondate = api;
})(this);
