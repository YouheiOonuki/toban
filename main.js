// ===========================
// 当番表 — 画面の制御（index.html）
// 決め方は calc.js（純粋関数）、祝日は constants.js、文は text.js の TEXT.duty
// ===========================
(function () {
  'use strict';
  var C = window.Calc, K = window.Constants, T = window.TEXT.duty;

  // --- ブラウザへの保存（README「ツールを追加するとき」12）。キーは "toban_" で始める ---
  var KEY_PREFIX = 'toban_';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };
  function $(id) { return document.getElementById(id); }
  function newSeed() {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function localYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var WD = '日月火水木金土';
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var el = {
    people: $('people'), duties: $('duties'), start: $('start'), end: $('end'), unavail: $('unavail'),
    skipHol: $('skip-hol'), title: $('title'), printCounts: $('print-counts'), printCredit: $('print-credit'),
    summary: $('summary'), notes: $('notes'), roster: $('roster'), counts: $('counts'), seedLabel: $('seed-label'),
    printArea: $('print-area'), reroll: $('reroll'), holInfo: $('hol-info'), days: $('days'),
  };
  DAY_ORDER.forEach(function (d) {
    var l = document.createElement('label');
    l.className = 'check day';
    l.innerHTML = '<input type="checkbox" value="' + d + '"> ' + WD[d];
    el.days.appendChild(l);
  });
  function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function setRadio(name, v) { var r = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }

  var state = C.normalizeDuty(store.get('duty', {}));
  var shared = null;        // 共有リンクで受け取った表（何か変えるまで、この表を出す）
  var sharedMode = false;   // 受け取った画面は「保存する」まで端末のデータを書きかえない

  function readForm() {
    return {
      people: el.people.value, duties: el.duties.value, unavail: el.unavail.value, seed: state.seed,
      credit: el.printCredit.checked, counts: el.printCounts.checked,
      settings: {
        start: el.start.value, end: el.end.value, unit: radio('unit'), order: radio('order'), skipHolidays: el.skipHol.checked, title: el.title.value,
        days: Array.prototype.map.call(el.days.querySelectorAll('input:checked'), function (i) { return Number(i.value); }),
      },
    };
  }
  function apply(d) {
    d = C.normalizeDuty(d);
    el.people.value = d.people; el.duties.value = d.duties; el.unavail.value = d.unavail;
    el.start.value = d.settings.start; el.end.value = d.settings.end; el.title.value = d.settings.title;
    setRadio('unit', d.settings.unit); setRadio('order', d.settings.order);
    el.skipHol.checked = d.settings.skipHolidays;
    el.days.querySelectorAll('input').forEach(function (i) { i.checked = d.settings.days.indexOf(Number(i.value)) >= 0; });
    el.printCredit.checked = d.credit; el.printCounts.checked = d.counts;
    state = d;
  }

  // 上端の固定バー（印刷物: 印刷ボタンの行が画面の外にあるときだけ、印刷ボタンを出す）
  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'print-row', jump: 'result-card', text: 'fixbar-text', onClick: function () { doPrint(); } });

  function dateLabel(ymd) {
    var d = C.parseYmd(ymd);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + WD[d.getUTCDay()] + '）';
  }
  function rowLabel(row, unit) {
    if (unit !== 'week') return dateLabel(row.from);
    return row.from === row.to ? dateLabel(row.from) : dateLabel(row.from) + '〜' + dateLabel(row.to);
  }

  var last = null;   // いま出している表（印刷・共有に使う）

  function compute() {
    var f = readForm();
    state = C.normalizeDuty(f);
    var s = state.settings;
    var notes = [];
    var pp = C.parsePeople(state.people);
    var names = pp.people.map(function (p) { return p.name; });
    pp.notes.forEach(function (n) { if (window.TEXT.ja[n.code]) notes.push(window.TEXT.ja[n.code](n)); });
    var dd = C.parseDuties(state.duties);
    dd.notes.forEach(function (n) { notes.push(T[n.code](n)); });
    var rr = C.dutyRows({ start: s.start, end: s.end, unit: s.unit, days: s.days, skipHolidays: s.skipHolidays, holidays: K.HOLIDAYS });
    var un = C.parseUnavail(state.unavail, names);
    if (un.unknown.length) notes.push(T.unknownNames(un.unknown));
    if (un.bad.length) notes.push(T.badTokens(un.bad));
    var endY = C.parseYmd(s.end);
    if (s.skipHolidays && endY && endY.getUTCFullYear() > K.HOLIDAY_YEARS.to) notes.push(T.stale(K.HOLIDAY_YEARS.to));

    var table, P = names.length, duties = dd.duties, empty = 0, fromShare = false;
    if (shared) {
      // 受け取った表をそのまま出す（名前が無ければ番号）
      names = shared.people || C.numberPeople(shared.count).map(function (p) { return p.name; });
      duties = shared.duties;
      P = names.length;
      table = shared.table;
      rr = C.dutyRows({ start: shared.settings.start, end: shared.settings.end, unit: shared.settings.unit, days: shared.settings.days, skipHolidays: shared.settings.skipHolidays, holidays: K.HOLIDAYS });
      fromShare = true;
    }
    var headMsg = '';
    if (!fromShare) {
      if (!P) headMsg = T.noPeople;
      else if (!duties.length) headMsg = T.noDuties;
      rr.notes.forEach(function (n) { var t = typeof T[n.code] === 'function' ? T[n.code](n) : T[n.code]; if (!headMsg && !rr.rows.length) headMsg = t; else notes.push(t); });
    }
    if (headMsg || !rr.rows.length) {
      last = null;
      el.summary.textContent = headMsg || T.noRows;
      renderNotes(notes);
      el.roster.innerHTML = ''; el.counts.innerHTML = ''; el.seedLabel.textContent = '';
      el.printArea.innerHTML = '';
      bar.set('');
      el.reroll.hidden = true;
      summaries();
      save();
      return;
    }
    if (!fromShare) {
      var res = C.makeRoster({ people: names, duties: duties, rows: rr.rows, order: s.order, unavail: un.map }, state.seed);
      res.notes.forEach(function (n) { notes.push(T[n.code](n)); });
      table = res.table;
      empty = res.empty.length;
    } else {
      table.forEach(function (cells) { cells.forEach(function (c, di) { if (c.length < duties[di].k) empty += duties[di].k - c.length; }); });
    }
    var rows = rr.rows.slice(0, table.length);
    var counts = C.countTable(table, P, duties.length);
    var totals = counts.map(function (c) { return c.total; });
    var lo = Math.min.apply(null, totals), hi = Math.max.apply(null, totals);
    el.summary.textContent = T.summary(rows.length, s.unit, P, lo, hi);
    if (empty) notes.push(T.empty(empty));
    if (rr.skipped.length && s.skipHolidays) notes.push(T.skipped(rr.skipped.map(function (x) { return { label: dateLabel(x.date), name: x.name }; })));
    renderNotes(notes);
    var unit = fromShare ? shared.settings.unit : s.unit;
    last = { names: names, duties: duties, rows: rows, table: table, counts: counts, unit: unit, title: fromShare ? shared.settings.title : s.title };
    el.roster.innerHTML = tableHtml(last);
    el.counts.innerHTML = countsHtml(last);
    el.seedLabel.textContent = s.order === 'lottery' && !fromShare ? window.TEXT.ja.seed(C.seedLabel(state.seed)) : '';
    el.reroll.hidden = fromShare || s.order !== 'lottery';
    buildPrint();
    bar.set(T.bar);
    summaries();
    save();
  }

  function renderNotes(notes) {
    el.notes.innerHTML = notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
  }
  function summaries() {
    var s = state.settings;
    var n = Object.keys(C.parseUnavail(state.unavail, C.parsePeople(state.people).people.map(function (p) { return p.name; })).map).length;
    window.YorozuScreen.detailsSummary({ 'opt-unit': T.unitState(s), 'opt-unavail': T.unavailState(n), 'opt-print': T.printState(s.title) });
  }
  function save() { if (!sharedMode) store.set('duty', state); }

  function tableHtml(L, forPrint) {
    var h = '<thead><tr><th scope="col">' + (L.unit === 'week' ? T.week : T.date) + '</th>' +
      L.duties.map(function (d) { return '<th scope="col">' + esc(d.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    L.rows.forEach(function (row, ri) {
      h += '<tr><th scope="row">' + esc(rowLabel(row, L.unit)) + '</th>' + L.table[ri].map(function (c, di) {
        var names = c.map(function (p) { return L.names[p]; });
        while (names.length < L.duties[di].k) names.push('—');
        return '<td>' + names.map(esc).join(forPrint ? '・' : '<br>') + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody>';
  }
  function countsHtml(L) {
    var multi = L.duties.length > 1;
    var h = '<thead><tr><th scope="col">' + T.person + '</th>' + (multi ? L.duties.map(function (d) { return '<th scope="col">' + esc(d.name) + '</th>'; }).join('') : '') +
      '<th scope="col">' + T.total + '</th></tr></thead><tbody>';
    L.names.forEach(function (n, p) {
      var c = L.counts[p];
      h += '<tr><th scope="row">' + esc(n) + '</th>' + (multi ? c.per.map(function (x) { return '<td>' + x + '</td>'; }).join('') : '') + '<td>' + c.total + '</td></tr>';
    });
    return h + '</tbody>';
  }
  function buildPrint() {
    if (!last) { el.printArea.innerHTML = ''; return; }
    var title = last.title || T.printTitle;
    var period = last.rows.length ? rowLabel(last.rows[0], 'day') + '〜' + dateLabel(last.rows[last.rows.length - 1].to) : '';
    // 1 枚に収まりやすいように、行が多いときは字と余白を小さく（回数の表も数える）
    var dense = last.rows.length + (el.printCounts.checked ? last.names.length + 3 : 0) > 26 ? ' dense' : '';
    var h = '<div class="sheet duty-sheet' + dense + '"><h1 class="p-title">' + esc(title) + '</h1><p class="p-sub">' + esc(period) + '</p>' +
      '<table class="p-table">' + tableHtml(last, true) + '</table>';
    if (el.printCounts.checked) h += '<h2 class="p-h2">' + T.counts + '</h2><table class="p-table p-counts">' + countsHtml(last) + '</table>';
    if (el.printCredit.checked) h += '<p class="p-credit">' + esc(T.credit) + '</p>';
    el.printArea.innerHTML = h + '</div>';
  }
  function doPrint() { buildPrint(); window.print(); }

  var timer = 0;
  function onInput() {
    if (shared) { shared = null; }
    clearTimeout(timer);
    timer = setTimeout(compute, 250);
  }
  $('form').addEventListener('input', onInput);
  document.querySelector('.opts').addEventListener('input', onInput);
  document.querySelector('.opts').addEventListener('change', onInput);
  // 終わりの日が空のときは、はじめの日から 1 か月
  el.start.addEventListener('change', function () { if (el.start.value && !el.end.value) { el.end.value = C.monthEnd(el.start.value); onInput(); } });
  $('print').addEventListener('click', doPrint);
  el.reroll.addEventListener('click', function () { state.seed = newSeed(); compute(); });

  // 祝日の表の範囲と確認日
  (function () {
    var months = (function () { var c = C.parseYmd(K.CHECKED), n = new Date(); return (n.getFullYear() - c.getUTCFullYear()) * 12 + n.getMonth() - c.getUTCMonth(); })();
    el.holInfo.innerHTML = '祝日は内閣府の「国民の祝日」の表（' + K.HOLIDAY_YEARS.from + '〜' + K.HOLIDAY_YEARS.to + ' 年、' + K.CHECKED + ' 確認）。' +
      (months >= K.STALE_MONTHS ? '確認日から時間がたっています。<a href="' + K.SOURCE.url + '" target="_blank" rel="noopener">内閣府のページ</a>もご確認ください。' : '');
  })();

  // --- 共有リンク（# 以降。既定は名前を入れない） ---
  $('share').addEventListener('click', function () {
    var msg = $('share-msg'), box = $('share-url');
    if (!last) { msg.textContent = T.noPeople; return; }
    var withNames = $('share-names').checked;
    if (withNames && !window.confirm(window.TEXT.ja.shareConfirmNames)) return;
    var hash = C.encodeDutyShare({ people: last.names, duties: last.duties, settings: shared ? shared.settings : state.settings, seed: state.seed, table: last.table }, withNames);
    var url = location.href.split('#')[0] + '#s=' + hash;
    box.value = url; box.hidden = false;
    var done = function () { msg.textContent = window.TEXT.ja.shareDone; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { msg.textContent = window.TEXT.ja.shareCopyFail; });
    else msg.textContent = window.TEXT.ja.shareCopyFail;
  });

  // --- ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31）。班分けのデータも一緒に ---
  var TOOL = 'toban';
  $('backup-export').addEventListener('click', function () {
    var data = { duty: state, group: C.normalizeGroup(store.get('group', {})) };
    var blob = new Blob([JSON.stringify(C.buildBackup(TOOL, data), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = window.TEXT.ja.exported;
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0], msg = $('backup-msg');
    this.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { msg.textContent = window.TEXT.ja.tooBig; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, TOOL, ['duty']);
      if (!r.ok) { msg.textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、今の当番表と班分けの入力を置き換えます。よろしいですか？')) return;
      shared = null; sharedMode = false; $('shared-banner').hidden = true;
      apply(r.data.duty);
      if (r.data.group) store.set('group', C.normalizeGroup(r.data.group));
      compute();
      msg.textContent = window.TEXT.ja.imported;
    }, function () { msg.textContent = window.TEXT.ja.readFail; });
  });

  // --- 読み込み時: 共有リンク（#s=）／グループ分けからの班（#han=N）／保存 ---
  var hash = location.hash;
  var fromShare = /^#s=/.test(hash) ? C.decodeDutyShare(hash) : null;
  apply(store.get('duty', {}));
  if (!state.settings.start) {
    var today = localYmd(new Date());
    el.start.value = today; el.end.value = C.monthEnd(today);
  }
  if (!state.seed) state.seed = newSeed();
  if (fromShare) {
    shared = fromShare; sharedMode = true;
    var people = fromShare.people || C.numberPeople(fromShare.count).map(function (p) { return p.name; });
    apply({ people: people.join('\n'), duties: fromShare.duties.map(function (d) { return d.k > 1 ? d.name + ' ' + d.k : d.name; }).join('\n'),
      unavail: '', settings: fromShare.settings, seed: fromShare.seed, credit: true, counts: true });
    $('shared-banner').hidden = false;
    $('shared-msg').textContent = T.shared(!!fromShare.people);
    $('shared-save').addEventListener('click', function () {
      sharedMode = false; save();
      $('shared-banner').hidden = true;
      history.replaceState(null, '', location.pathname);
    });
  } else {
    var m = /^#han=(\d{1,2})$/.exec(hash);
    if (m) {
      var n = Math.min(50, Math.max(2, Number(m[1])));
      var list = []; for (var i = 1; i <= n; i++) list.push(i + '班');
      if (!el.people.value.trim() || el.people.value.trim() === list.join('\n') || window.confirm(T.fromHanConfirm(n))) {
        el.people.value = list.join('\n');
      }
      history.replaceState(null, '', location.pathname);
    }
  }
  compute();

  // 印刷の直前に、いまの表で作り直す（ブラウザのメニューから印刷したときも）
  window.addEventListener('beforeprint', buildPrint);

  // オフライン対応（登録は './sw.js' だけ。scope: '/' を指定しない。README「ツールを追加するとき」13）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
})();
