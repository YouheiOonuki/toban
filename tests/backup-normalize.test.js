// バックアップを読んだ中身の正規化など、この repo だけの確かめ。形の確かめは共通の本体（同じフォルダの backup.test.js。値は backup.values.json）にある（yorozu-plans 7.271）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBackup, parseBackup, normalizeDuty, normalizeGroup } = require('../calc.js');

const TOOL = 'toban';
const DATA = { duty: normalizeDuty({ people: '青木\n井上', duties: '日直' }), group: normalizeGroup({ people: '青木,男', history: [{ at: 'x', groups: [['青木']] }] }) };

test('書き出し→読み込み→正規化で同じ中身', () => {
  const r = parseBackup(JSON.stringify(buildBackup(TOOL, DATA)), TOOL, ['group']);
  assert.equal(r.ok, true);
  assert.deepEqual(normalizeDuty(r.data.duty), DATA.duty);
  assert.deepEqual(normalizeGroup(r.data.group), DATA.group);
});
