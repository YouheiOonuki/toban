// ===========================
// グループ分け — 画面の制御（group/index.html と en/index.html で共用）
// 決め方は calc.js（純粋関数）、文は text.js の TEXT[lang]（<html lang> で選ぶ）
// ===========================
(function () {
  'use strict';
  var C = window.Calc;
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'ja';
  var T = window.TEXT[LANG];

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
  function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function setRadio(name, v) { var r = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }
  function nowLabel() {
    var d = new Date();
    return LANG === 'en'
      ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5)
      : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toTimeString().slice(0, 5);
  }

  var el = {
    names: $('names'), count: $('count'), by: $('by'), n: $('n'), gender: $('gender'), star: $('star'),
    apart: $('apart'), together: $('together'), avoidPrev: $('avoid-prev'), title: $('title'), credit: $('print-credit'),
    summary: $('summary'), notes: $('notes'), groups: $('groups'), seedLabel: $('seed-label'), printArea: $('print-area'),
    peopleInfo: $('people-info'), prevInfo: $('prev-info'), history: $('history'), nextStep: $('next-step'),
  };

  var state = C.normalizeGroup(store.get('group', {}));
  var shared = null, sharedMode = false;
  var last = null;   // いま出している班

  function readForm() {
    return Object.assign({}, state, {
      people: el.names.value, numbers: radio('plist') === 'numbers', count: el.count.value, by: el.by.value, n: el.n.value,
      gender: el.gender.checked, star: el.star.checked, apart: el.apart.value, together: el.together.value,
      avoidPrev: el.avoidPrev.checked, title: el.title.value, credit: el.credit.checked,
    });
  }
  function apply(d) {
    d = C.normalizeGroup(d);
    el.names.value = d.people; setRadio('plist', d.numbers ? 'numbers' : 'names'); el.count.value = d.count;
    el.by.value = d.by; el.n.value = d.n; el.gender.checked = d.gender; el.star.checked = d.star;
    el.apart.value = d.apart; el.together.value = d.together; el.avoidPrev.checked = d.avoidPrev;
    el.title.value = d.title; el.credit.checked = d.credit;
    state = d;
    panels();
  }
  function panels() {
    var num = radio('plist') === 'numbers';
    $('names-panel').hidden = num; $('numbers-panel').hidden = !num;
  }

  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'print-row', jump: 'result-card', text: 'fixbar-text', onClick: function () { doPrint(); } });

  function peopleNow() {
    if (state.numbers) return { people: C.numberPeople(state.count), notes: [] };
    return C.parsePeople(state.people);
  }

  function compute() {
    state = C.normalizeGroup(readForm());
    var notes = [], bad = [];
    var pp = shared ? { people: shared.people || C.numberPeople(shared.count), notes: [] } : peopleNow();
    var people = pp.people, names = people.map(function (p) { return p.name; });
    pp.notes.forEach(function (n) { notes.push(T[n.code](n)); });
    var gc = { M: 0, F: 0, none: 0, star: 0 };
    people.forEach(function (p) { if (p.g === 'M') gc.M++; else if (p.g === 'F') gc.F++; else gc.none++; if (p.star) gc.star++; });
    el.peopleInfo.textContent = people.length ? T.people(people.length, gc) : '';
    var ap = C.parseSets(state.apart, names), tg = C.parseSets(state.together, names);
    var unknown = ap.unknown.concat(tg.unknown.filter(function (n) { return ap.unknown.indexOf(n) < 0; }));
    if (unknown.length && !shared) notes.push(T.unknownNames(unknown));
    var prevH = state.history[0] || null;
    el.prevInfo.textContent = T.prevInfo(prevH);
    var input = { people: people, by: state.by, n: state.n, gender: state.gender, star: state.star, apart: ap.sets, together: tg.sets,
      prev: state.avoidPrev && prevH ? [prevH.groups] : null };
    var res;
    if (shared) {
      res = { groups: shared.groups, sizes: shared.groups.map(function (g) { return g.length; }), pre: [], violations: [], repeats: 0 };
    } else {
      res = C.makeGroups(input, state.seed);
    }
    window.YorozuScreen.detailsSummary({
      'opt-cond': T.condState({ gender: state.gender, star: state.star, apart: ap.sets.length, together: tg.sets.length, avoidPrev: state.avoidPrev }),
      'opt-print': state.title || (LANG === 'en' ? 'no title' : '見出しなし'),
    });
    if (!people.length || !res.groups.length) {
      last = null;
      el.summary.textContent = T.noPeople;
      el.notes.innerHTML = notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
      el.groups.innerHTML = ''; el.seedLabel.textContent = ''; el.printArea.innerHTML = '';
      el.nextStep.hidden = true;
      bar.set('');
      save();
      return;
    }
    if (res.groups.length < 2 && people.length > 1) bad.push(T.oneGroup);
    res.pre.forEach(function (n) { bad.push(T[n.code](n)); });
    var badGroups = {};
    res.violations.forEach(function (v) { bad.push(T[v.code](v)); if (v.group) badGroups[v.group - 1] = 1; });
    if (res.violations.length && !res.pre.length) bad.push(T.notKept);
    var sizes = res.groups.map(function (g) { return g.length; });
    el.summary.textContent = T.groupsHead(sizes) + (!shared && !res.violations.length && (input.apart.length || input.together.length || input.gender || input.star) ? ' ' + T.allKept : '');
    if (input.prev && !shared) notes.push(T.repeats(res.repeats));
    el.notes.innerHTML = bad.map(function (n) { return '<li class="bad">' + esc(n) + '</li>'; }).join('') + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    var byName = {};
    people.forEach(function (p) { byName[p.name] = p; });
    last = { groups: res.groups, people: people, byName: byName };
    el.groups.innerHTML = res.groups.map(function (g, i) {
      return '<section class="group' + (badGroups[i] ? ' bad' : '') + '"><h3>' + esc(T.groupName(i)) + ' <small>' + esc(T.groupCount(g, byName)) + '</small></h3><ol>' +
        g.map(function (n) {
          var p = byName[n] || {};
          var tag = (p.g === 'M' ? (LANG === 'en' ? 'M' : '男') : p.g === 'F' ? (LANG === 'en' ? 'F' : '女') : '') + (p.star ? '★' : '');
          return '<li>' + esc(n) + (tag ? '<span class="g">' + tag + '</span>' : '') + '</li>';
        }).join('') + '</ol></section>';
    }).join('');
    el.seedLabel.textContent = T.seed(C.seedLabel(shared ? shared.seed : state.seed));
    if (el.nextStep) {
      el.nextStep.hidden = false;
      var a = el.nextStep.querySelector('a');
      if (a) a.href = a.getAttribute('data-base') + '#han=' + res.groups.length;
    }
    buildPrint();
    bar.set(T.barGroups(res.groups.length));
    save();
  }
  function save() { if (!sharedMode) store.set('group', state); }

  function buildPrint() {
    if (!last) { el.printArea.innerHTML = ''; return; }
    var title = (shared && shared.title) || state.title || T.printTitle;
    var maxLen = Math.max.apply(null, last.groups.map(function (g) { return g.length; }));
    var many = last.groups.length > 8 || maxLen > 8;
    var cls = 'p-groups' + (last.groups.length > 6 ? ' cols3' : '') + (many ? ' small' : '');
    var h = '<div class="sheet"><h1 class="p-title">' + esc(title) + '</h1><div class="' + cls + '">' +
      last.groups.map(function (g, i) {
        return '<section class="p-group"><h2>' + esc(T.groupName(i)) + '</h2><ol>' + g.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ol></section>';
      }).join('') + '</div>';
    if (el.credit.checked) h += '<p class="p-credit">' + esc(T.credit) + '</p>';
    el.printArea.innerHTML = h + '</div>';
  }
  function doPrint() { buildPrint(); window.print(); }

  function renderHistory() {
    el.history.innerHTML = state.history.length
      ? state.history.map(function (h) { return '<li>' + esc(T.historyItem(h)) + ': ' + h.groups.map(function (g, i) { return esc(T.groupName(i)) + ' ' + g.map(esc).join('・'); }).join(' / ') + '</li>'; }).join('')
      : '<li>' + esc(T.historyNone) + '</li>';
  }

  var timer = 0;
  function onInput() {
    shared = null;
    panels();
    clearTimeout(timer);
    timer = setTimeout(compute, 250);
  }
  document.querySelectorAll('.watch').forEach(function (box) {
    box.addEventListener('input', onInput);
    box.addEventListener('change', onInput);
  });
  $('print').addEventListener('click', doPrint);
  $('reroll').addEventListener('click', function () { shared = null; state.seed = newSeed(); compute(); });
  $('decide').addEventListener('click', function () {
    if (!last) return;
    state.history = C.addHistory(state.history, { at: nowLabel(), groups: last.groups });
    save();
    renderHistory();
    $('decide-msg').textContent = T.decided;
    compute();
  });

  // --- 共有リンク（# 以降。既定は名前を入れない） ---
  $('share').addEventListener('click', function () {
    var msg = $('share-msg'), box = $('share-url');
    if (!last) { msg.textContent = T.noPeople; return; }
    var withNames = $('share-names').checked;
    if (withNames && !window.confirm(T.shareConfirmNames)) return;
    var hash = C.encodeGroupShare({ people: last.people, seed: shared ? shared.seed : state.seed, groups: last.groups, title: state.title }, withNames);
    var url = location.href.split('#')[0] + '#s=' + hash;
    box.value = url; box.hidden = false;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { msg.textContent = T.shareDone; }, function () { msg.textContent = T.shareCopyFail; });
    else msg.textContent = T.shareCopyFail;
  });

  // --- ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31）。当番表のデータも一緒に ---
  var TOOL = 'toban';
  $('backup-export').addEventListener('click', function () {
    var data = { duty: C.normalizeDuty(store.get('duty', {})), group: state };
    var blob = new Blob([JSON.stringify(C.buildBackup(TOOL, data), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = T.exported;
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0], msg = $('backup-msg');
    this.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { msg.textContent = T.tooBig; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, TOOL, ['group']);
      if (!r.ok) { msg.textContent = LANG === 'en' ? T.readFail + ' ' + T.tooBig.split('. ')[1] : r.error; return; }
      if (!window.confirm(T.importConfirm)) return;
      shared = null; sharedMode = false; $('shared-banner').hidden = true;
      apply(r.data.group);
      if (r.data.duty) store.set('duty', C.normalizeDuty(r.data.duty));
      renderHistory();
      compute();
      msg.textContent = T.imported;
    }, function () { msg.textContent = T.readFail; });
  });

  // --- 読み込み時 ---
  apply(store.get('group', {}));
  if (!state.seed) state.seed = newSeed();
  var fromShare = /^#s=/.test(location.hash) ? C.decodeGroupShare(location.hash) : null;
  if (fromShare) {
    shared = fromShare; sharedMode = true;
    var list = fromShare.people || C.numberPeople(fromShare.count);
    apply(Object.assign({}, state, {
      people: fromShare.people ? list.map(function (p) { return p.name + (p.g === 'M' ? ',男' : p.g === 'F' ? ',女' : '') + (p.star ? '★' : ''); }).join('\n') : '',
      numbers: !fromShare.people, count: fromShare.count, by: 'count', n: fromShare.groups.length, seed: fromShare.seed, title: fromShare.title,
      apart: '', together: '', avoidPrev: false, gender: false, star: false,
    }));
    $('shared-banner').hidden = false;
    $('shared-msg').textContent = T.shared(C.seedLabel(fromShare.seed), !!fromShare.people);
    $('shared-save').addEventListener('click', function () {
      sharedMode = false; save();
      $('shared-banner').hidden = true;
      history.replaceState(null, '', location.pathname);
      $('shared-msg').textContent = T.savedShared;
    });
  }
  renderHistory();
  compute();
  window.addEventListener('beforeprint', buildPrint);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', function () { navigator.serviceWorker.register(document.querySelector('link[rel="manifest"]').getAttribute('href').replace('manifest.webmanifest', 'sw.js')).catch(function () {}); });
  }
})();
