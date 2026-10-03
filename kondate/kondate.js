// ===========================
// 献立ローテーション表（kondate/index.html）の画面
// 計算は ./kondate-calc.js（決め方は先頭のコメント）。保存は localStorage の toban_kondate だけ
// ===========================
(function () {
  'use strict';
  var C = window.Calc, K = window.Kondate;
  var KEY = 'toban_kondate';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var st;
  try { st = K.normalize(JSON.parse(localStorage.getItem(KEY) || 'null'), new Date()); } catch (e) { st = K.normalize(null, new Date()); }
  var timer = 0;
  function flush() { clearTimeout(timer); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できなくても動く */ } }
  function save() { clearTimeout(timer); timer = setTimeout(flush, 300); }
  window.addEventListener('pagehide', flush);

  // 作らない曜日（月曜はじまりで並べる）
  $('skip-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (w) {
    return '<label class="check kd-day"><input type="checkbox" value="' + w + '"> ' + K.WD[w] + '</label>';
  }).join('');

  function sync() {
    $('dishes').value = st.dishes;
    $('start').value = st.start;
    $('weeks').value = String(st.weeks);
    $('no-same-kind').checked = st.noSameKind;
    $('fixed').value = st.fixed;
    $('title').value = st.title;
    $('memo').checked = st.memo;
    $('credit').checked = st.credit;
    [].forEach.call($('skip-days').querySelectorAll('input'), function (el) { el.checked = st.skipDays.indexOf(Number(el.value)) >= 0; });
  }

  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'print', jump: 'result-card', text: 'fixbar-text', onClick: function () { window.print(); } });

  function md(s) { var p = s.split('-'); return Number(p[1]) + '/' + Number(p[2]); }

  function tableHtml(menu, forPrint) {
    var head = '<thead><tr>' + menu.weeks[0].map(function (c) { return '<th scope="col">' + K.WD[c.w] + '</th>'; }).join('') + '</tr></thead>';
    var body = menu.weeks.map(function (row) {
      var r = '<tr>' + row.map(function (c) {
        var cls = c.skip ? ' class="skip"' : (c.fixed ? ' class="fixed"' : '');
        return '<td' + cls + '><span class="kd-date">' + md(c.date) + '</span><span class="kd-dish">' + (c.skip ? '（作らない）' : esc(c.dish || '—')) + '</span>' +
          (c.kind && !c.skip ? '<span class="kd-kind">' + esc(c.kind) + '</span>' : '') + '</td>';
      }).join('') + '</tr>';
      if (st.memo && forPrint) r += '<tr class="kd-memo">' + row.map(function () { return '<td><span class="kd-memo-l">買い物メモ</span></td>'; }).join('') + '</tr>';
      return r;
    }).join('');
    return head + '<tbody>' + body + '</tbody>';
  }

  function render() {
    var dishes = K.parseDishes(st.dishes);
    var fixed = K.parseFixed(st.fixed);
    var menu = K.makeMenu({ dishes: dishes, start: st.start, weeks: st.weeks, skipDays: st.skipDays, fixed: fixed, noSameKind: st.noSameKind }, st.seed);
    var kinds = {};
    dishes.forEach(function (d) { if (d.kind) kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
    $('dish-info').textContent = dishes.length + ' 品' + (Object.keys(kinds).length ? '（' + Object.keys(kinds).map(function (k) { return k + ' ' + kinds[k]; }).join('・') + '）' : '');

    if (!menu.weeks.length) {
      $('kd-table').innerHTML = '';
      $('summary').textContent = 'はじめの日を入れてください。';
      bar.set('');
      return;
    }
    $('kd-table').innerHTML = tableHtml(menu, false);
    var cooking = 0;
    menu.weeks.forEach(function (r) { r.forEach(function (c) { if (c.dish) cooking++; }); });
    var max = 0;
    flatCells(menu).forEach(function (c) { if (c.dish && !c.fixed) max = Math.max(max, menu.counts[c.dish]); });
    var msg = cooking + ' 日分。';
    if (!dishes.length) msg = '料理を 1 行に 1 品入れてください。';
    else if (menu.notes.indexOf('repeat') >= 0) msg += '料理が日数より少ないので、同じ料理は ' + max + ' 回まで出ます（間をあけて）。';
    else msg += '同じ料理は出ません。';
    var runs = K.sameKindRuns(menu.weeks);
    if (st.noSameKind && runs) msg += '同じ種類が続く日が ' + runs + ' 回あります（種類の数が足りないため）。';
    $('summary').textContent = msg;
    $('seed-label').textContent = 'くじ番号 ' + C.seedLabel(st.seed);

    var last = menu.weeks[menu.weeks.length - 1][6].date;
    var title = st.title || ('献立表 ' + md(st.start) + '〜' + md(last));
    $('print-area').innerHTML = '<div class="sheet kd-sheet"><h1 class="p-title">' + esc(title) + '</h1>' +
      '<table class="p-table kd-ptable">' + tableHtml(menu, true) + '</table>' +
      (st.credit ? '<p class="p-credit">yorozu-craft.com/toban/print/ で作成</p>' : '') + '</div>';

    window.YorozuScreen.detailsSummary({
      'opt-rule': [st.noSameKind ? '同じ種類を続けない' : '種類は見ない', st.skipDays.length ? '作らない ' + st.skipDays.map(function (w) { return K.WD[w]; }).join('・') : '', Object.keys(fixed).length ? '決まった日 ' + Object.keys(fixed).length : ''].filter(Boolean).join('・'),
      'opt-print': (st.memo ? '買い物メモあり' : 'メモなし') + (st.title ? '・' + st.title : '')
    });
    bar.set(dishes.length ? '印刷する（' + st.weeks + ' 週間分）' : '');
  }

  function flatCells(menu) { return [].concat.apply([], menu.weeks); }
  function update() { render(); save(); }
  $('dishes').addEventListener('input', function () { st.dishes = $('dishes').value.slice(0, 4000); update(); });
  $('start').addEventListener('change', function () { if (C.parseYmd($('start').value)) { st.start = $('start').value; update(); } });
  $('weeks').addEventListener('change', function () { st.weeks = Number($('weeks').value); update(); });
  $('no-same-kind').addEventListener('change', function () { st.noSameKind = $('no-same-kind').checked; update(); });
  $('fixed').addEventListener('input', function () { st.fixed = $('fixed').value.slice(0, 400); update(); });
  $('title').addEventListener('input', function () { st.title = $('title').value.slice(0, 40); update(); });
  $('memo').addEventListener('change', function () { st.memo = $('memo').checked; update(); });
  $('credit').addEventListener('change', function () { st.credit = $('credit').checked; update(); });
  $('skip-days').addEventListener('change', function () {
    st.skipDays = [].filter.call($('skip-days').querySelectorAll('input'), function (el) { return el.checked; }).map(function (el) { return Number(el.value); });
    update();
  });
  $('reroll').addEventListener('click', function () {
    var a = new Uint32Array(1);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : (a[0] = Date.now() >>> 0);
    st.seed = a[0];
    update();
  });
  $('print').addEventListener('click', function () { window.print(); });

  // 書き出し・読み込み（README「ツールを追加するとき」20。当番表・班分けと同じ形）
  $('backup-export').addEventListener('click', function () {
    var json = JSON.stringify(C.buildBackup('toban', { toban_kondate: st }), null, 1);
    var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = C.backupFileName('toban');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    $('backup-msg').textContent = 'ファイルに書き出しました。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var f = $('backup-file').files[0];
    $('backup-file').value = '';
    if (!f) return;
    f.text().then(function (t) {
      var r = C.parseBackup(t, 'toban', ['toban_kondate']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、いまの料理と設定を上書きしますか？')) return;
      st = K.normalize(r.data.toban_kondate, new Date());
      sync(); update();
      $('backup-msg').textContent = 'ファイルから読み込みました。';
    });
  });

  sync();
  render();
})();
