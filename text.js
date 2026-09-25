// ===========================
// 画面に出す文（calc.js は { code } を返し、ここで文にする）
// グループ分けは日本語（ja）と英語（en）。当番表は日本語だけ
// ブラウザでは window.TEXT、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  function list(a, sep) { return (a || []).join(sep || '、'); }

  var TEXT = {
    ja: {
      // --- 名簿・条件の読み取り ---
      dupNames: function (n) { return '同じ名前の人に ② ③ を付けました（' + list(n.names) + '）。'; },
      tooManyLines: function (n) { return n.max + ' 人までです。残りの ' + n.cut + ' 行は使いません。'; },
      unknownNames: function (names) { return '名簿に無い名前は使いません: ' + list(names); },
      people: function (n, g) {
        var s = n + ' 人';
        if (g.M || g.F) s += '（男 ' + g.M + '・女 ' + g.F + (g.none ? '・未記入 ' + g.none : '') + '）';
        if (g.star) s += '、★ ' + g.star + ' 人';
        return s;
      },
      // --- グループ分け ---
      groupsHead: function (sizes) {
        var lo = Math.min.apply(null, sizes), hi = Math.max.apply(null, sizes);
        return sizes.length + ' 班（1 班 ' + (lo === hi ? lo : lo + '〜' + hi) + ' 人）';
      },
      groupName: function (i) { return (i + 1) + '班'; },
      groupCount: function (g, P) {
        var m = 0, f = 0, s = 0;
        g.forEach(function (n) { var p = P[n]; if (!p) return; if (p.g === 'M') m++; if (p.g === 'F') f++; if (p.star) s++; });
        var out = g.length + ' 人';
        if (m || f) out += '（男 ' + m + '・女 ' + f + '）';
        if (s) out += ' ★' + s;
        return out;
      },
      allKept: '条件はすべて守れています。',
      repeats: function (n) { return n ? '前回と同じ班になった 2 人: ' + n + ' 組（探した中でいちばん少ない数）' : '前回と同じ班だった 2 人は、別の班になりました。'; },
      noPeople: '名簿を入れると班ができます。',
      oneGroup: '班が 1 つだけになります。班の数か人数を見直してください。',
      togetherTooBig: function (n) { return '「同じ班」の ' + n.size + ' 人（' + list(n.names) + '）が、1 班の人数 ' + n.max + ' 人より多いです。'; },
      apartTooMany: function (n) { return '「別の班」の ' + n.names.length + ' 人（' + list(n.names) + '）は、班の数 ' + n.groups + ' より多いので全員は分けられません。'; },
      apartAndTogether: function (n) { return n.a + ' と ' + n.b + ' が「同じ班」と「別の班」の両方に入っています。'; },
      apartBroken: function (n) { return n.a + ' と ' + n.b + ' が同じ ' + n.group + '班です（別の班の条件）。'; },
      togetherBroken: function (n) { return list(n.names) + ' が別々の班です（同じ班の条件）。'; },
      balanceBroken: function (n) {
        var what = n.key === 'M' ? '男子' : n.key === 'F' ? '女子' : '★の人';
        return what + 'の数をそろえきれませんでした（班ごとに ' + n.counts.join('・') + ' 人）。';
      },
      sizeBroken: function (n) { return '班の人数がそろいませんでした（' + n.sizes.join('・') + ' 人）。「同じ班」の組を見直してください。'; },
      notKept: '守れなかった条件があります。条件を減らすか、班の数を変えてください。',
      seed: function (s) { return 'くじ番号 ' + s; },
      decided: '記録しました。次に「前回と同じ班を避ける」で使います。',
      historyItem: function (h) { return h.at + '（' + h.groups.length + ' 班）'; },
      historyNone: 'まだありません。',
      prevInfo: function (h) { return h ? '前回: ' + h.at + ' の ' + h.groups.length + ' 班' : '「この班で決定」を押すと、次から使えます。'; },
      condState: function (c) {
        var a = [];
        if (c.gender) a.push('男女');
        if (c.star) a.push('★');
        if (c.apart) a.push('別の班 ' + c.apart + ' 組');
        if (c.together) a.push('同じ班 ' + c.together + ' 組');
        if (c.avoidPrev) a.push('前回を避ける');
        return a.length ? a.join('・') : 'なし';
      },
      barGroups: function (n) { return n + ' 班を印刷する'; },
      printTitle: '班分け',
      credit: 'yorozu-craft.com/toban/print/ で作成',
      shared: function (seed, names) { return '共有された班分けです（くじ番号 ' + seed + '）。' + (names ? '' : '名前は入っていないので、名簿の番号で出しています。'); },
      shareDone: 'リンクをコピーしました。',
      shareCopyFail: 'コピーできませんでした。下の欄のリンクを長押しでコピーしてください。',
      shareConfirmNames: '名前が入ったリンクを作ります。リンクを受け取った人（転送された人も）が名前を読めます。よろしいですか？',
      savedShared: 'この端末に保存しました。',
      exported: 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。',
      imported: 'ファイルから読み込みました。',
      importConfirm: 'ファイルの内容で、今の名簿・条件・記録を置き換えます。よろしいですか？',
      tooBig: 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。',
      readFail: 'ファイルを読み取れませんでした。',
    },
    en: {
      dupNames: function (n) { return 'Duplicate names were numbered ②, ③ (' + list(n.names, ', ') + ').'; },
      tooManyLines: function (n) { return 'Up to ' + n.max + ' people. The last ' + n.cut + ' lines are ignored.'; },
      unknownNames: function (names) { return 'Not in the list, ignored: ' + list(names, ', '); },
      people: function (n, g) {
        var s = n + (n === 1 ? ' person' : ' people');
        if (g.M || g.F) s += ' (' + g.M + ' M, ' + g.F + ' F' + (g.none ? ', ' + g.none + ' not set' : '') + ')';
        if (g.star) s += ', ★ ' + g.star;
        return s;
      },
      groupsHead: function (sizes) {
        var lo = Math.min.apply(null, sizes), hi = Math.max.apply(null, sizes);
        return sizes.length + ' groups of ' + (lo === hi ? lo : lo + '–' + hi) + '.';
      },
      groupName: function (i) { return 'Group ' + (i + 1); },
      groupCount: function (g, P) {
        var m = 0, f = 0, s = 0;
        g.forEach(function (n) { var p = P[n]; if (!p) return; if (p.g === 'M') m++; if (p.g === 'F') f++; if (p.star) s++; });
        var out = String(g.length);
        if (m || f) out += ' (' + m + ' M, ' + f + ' F)';
        if (s) out += ' ★' + s;
        return out;
      },
      allKept: 'All conditions are met.',
      repeats: function (n) { return n ? 'Pairs from last time still together: ' + n + ' (the fewest found).' : 'Nobody is with a groupmate from last time.'; },
      noPeople: 'Paste your list to make groups.',
      oneGroup: 'This makes only one group. Change the number of groups or the group size.',
      togetherTooBig: function (n) { return 'The ' + n.size + ' people kept together (' + list(n.names, ', ') + ') are more than a group of ' + n.max + '.'; },
      apartTooMany: function (n) { return 'You asked to separate ' + n.names.length + ' people (' + list(n.names, ', ') + '), but there are only ' + n.groups + ' groups.'; },
      apartAndTogether: function (n) { return n.a + ' and ' + n.b + ' are in both "keep apart" and "keep together".'; },
      apartBroken: function (n) { return n.a + ' and ' + n.b + ' are both in Group ' + n.group + ' (keep apart).'; },
      togetherBroken: function (n) { return list(n.names, ', ') + ' are in different groups (keep together).'; },
      balanceBroken: function (n) {
        var what = n.key === 'M' ? 'males' : n.key === 'F' ? 'females' : '★ people';
        return 'Could not even out the ' + what + ' (' + n.counts.join(', ') + ' per group).';
      },
      sizeBroken: function (n) { return 'Group sizes are uneven (' + n.sizes.join(', ') + '). Check "keep together".'; },
      notKept: 'Some conditions could not be met. Remove one or change the number of groups.',
      seed: function (s) { return 'Draw no. ' + s; },
      decided: 'Saved. "Avoid last groups" will use it next time.',
      historyItem: function (h) { return h.at + ' (' + h.groups.length + ' groups)'; },
      historyNone: 'None yet.',
      prevInfo: function (h) { return h ? 'Last: ' + h.at + ', ' + h.groups.length + ' groups' : 'Press "Use these groups" first.'; },
      condState: function (c) {
        var a = [];
        if (c.gender) a.push('gender');
        if (c.star) a.push('★');
        if (c.apart) a.push(c.apart + ' apart');
        if (c.together) a.push(c.together + ' together');
        if (c.avoidPrev) a.push('avoid last');
        return a.length ? a.join(', ') : 'none';
      },
      barGroups: function (n) { return 'Print ' + n + ' groups'; },
      printTitle: 'Groups',
      credit: 'Made at yorozu-craft.com/toban/print/',
      shared: function (seed, names) { return 'Shared groups (draw no. ' + seed + ').' + (names ? '' : ' Names are not included, so people are shown by list number.'); },
      shareDone: 'Link copied.',
      shareCopyFail: 'Could not copy. Copy the link from the box below.',
      shareConfirmNames: 'The link will include names. Anyone who gets the link can read them. Continue?',
      savedShared: 'Saved on this device.',
      exported: 'File saved. To move to a new device, open this page there and choose "Load from file".',
      imported: 'Loaded from the file.',
      importConfirm: 'Replace your current list, conditions, and history with the file?',
      tooBig: 'The file is too large. Choose a file saved by this tool.',
      readFail: 'Could not read the file.',
    },
  };

  // 当番表（日本語だけ）
  TEXT.duty = {
    tooManyDuties: function (n) { return '当番の種類は ' + n.max + ' までです。'; },
    notEnoughPeople: function (n) { return '1 回に要る人数（' + n.need + ' 人）が、担当する人（' + n.have + ' 人）より多いので、空きが出ます。'; },
    noDates: '期間（はじめの日と終わりの日）を入れてください。',
    endBeforeStart: '終わりの日が、はじめの日より前です。',
    rangeCut: function (n) { return '期間は ' + n.days + ' 日までにしました。'; },
    tooManyRows: function (n) { return n.max + ' 回分までです。期間を短くしてください。'; },
    noDays: '当番の曜日を 1 つ以上選んでください。',
    noRows: 'この期間に当番の日がありません。曜日と祝日の設定を見直してください。',
    noPeople: '担当する人を入れてください。',
    noDuties: '当番の種類を入れてください。',
    unknownNames: function (names) { return '担当できない日: 名簿に無い名前は使いません（' + list(names) + '）。'; },
    badTokens: function (t) { return '担当できない日: 読めなかったもの（' + list(t) + '）。「10/3」「水」の形で。'; },
    summary: function (rows, unit, P, lo, hi) {
      return rows + (unit === 'week' ? ' 週' : ' 日') + '分・' + P + ' 人。1 人 ' + (lo === hi ? lo : lo + '〜' + hi) + ' 回' + (hi - lo > 0 ? '（差 ' + (hi - lo) + ' 回）' : '');
    },
    empty: function (n) { return '担当できる人がいなくて空いた枠: ' + n + ' か所（表では「—」）。'; },
    skipped: function (h) { return '祝日で除いた日: ' + h.map(function (x) { return x.label + ' ' + x.name; }).join('、'); },
    bar: '当番表を印刷する',
    unitState: function (s) {
      var wd = '日月火水木金土';
      var days = s.days.length === 5 && s.days.join() === '1,2,3,4,5' ? '平日' : s.days.map(function (d) { return wd[d]; }).join('');
      return (s.unit === 'week' ? '週ごと' : '日ごと') + '・' + (days || '曜日なし') + (s.skipHolidays ? '・祝日を除く' : '') + '・' + (s.order === 'lottery' ? 'くじ' : '名簿の順');
    },
    unavailState: function (n) { return n ? n + ' 人' : 'なし'; },
    printState: function (t) { return t || '見出しなし'; },
    printTitle: '当番表',
    credit: 'yorozu-craft.com/toban/print/ で作成',
    counts: '回数',
    total: '合計',
    person: '名前',
    date: '日',
    week: '週',
    fromHan: function (n) { return 'グループ分けの ' + n + ' 班を「担当する人」に入れました。'; },
    fromHanConfirm: function (n) { return '「担当する人」を 1班〜' + n + '班 に置き換えます。よろしいですか？'; },
    shared: function (names) { return '共有された当番表です。' + (names ? '' : '名前は入っていないので、番号で出しています。'); },
    stale: function (to) { return '祝日の表は ' + to + ' 年までです。それより後の祝日は除かれません。'; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TEXT;
  else root.TEXT = TEXT;
})(this);
