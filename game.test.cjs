const test = require('node:test');
const assert = require('node:assert/strict');
const { createCard, reward, CELL_COUNT, WIN_RATE, CARD_WIN_RATE } = require('./game.js');
const { createVariantCard, evaluateCard } = require('./game.js');

test('三同金额必须同组全部揭晓，奖励只计一次', () => {
  const card = { mode: 'triple', cells: [50, 50, 50, 20, 20, 100].map(amount => ({ amount })), groups: [{ indices: [0, 1, 2] }, { indices: [3, 4, 5] }] };
  assert.equal(evaluateCard(card, new Set([0, 1])).total, 0);
  assert.deepEqual(evaluateCard(card, new Set([0, 1, 2, 3, 4, 5])), { total: 50, winningIndices: [0, 1, 2] });
});

test('比大小只在严格大于时中奖，平局不中奖，跨组不比较', () => {
  const card = { mode: 'duel', cells: [20, 10, 8, 8, 3, 30].map(number => ({ number })), groups: [{ indices: [0, 1], prize: 100 }, { indices: [2, 3], prize: 200 }, { indices: [4, 5], prize: 500 }] };
  assert.equal(evaluateCard(card, new Set([0, 2, 4])).total, 0);
  assert.deepEqual(evaluateCard(card, new Set([0, 1, 2, 3, 4, 5])), { total: 100, winningIndices: [0, 1] });
});

for (const mode of ['triple', 'duel']) {
  test(`${mode} 生成无意外中奖且整卡中奖率约为10%`, () => {
    const losing = createVariantCard(mode, () => 0.5);
    const all = new Set(Array.from({ length: 24 }, (_, index) => index));
    assert.equal(losing.cells.length, 24);
    assert.equal(evaluateCard(losing, all).total, 0);
    assert.ok(evaluateCard(createVariantCard(mode, () => 0), all).total > 0);
    let seed = 9876;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    let wins = 0;
    for (let index = 0; index < 20000; index++) {
      const card = createVariantCard(mode, random);
      assert.equal(card.cells.length, 24);
      if (mode === 'duel') assert.ok(card.cells.every(cell => cell.number >= 1 && cell.number <= 30));
      if (evaluateCard(card, all).total > 0) wins++;
    }
    assert.ok(Math.abs(wins / 20000 - 0.1) < 0.01);
  });
}

test('数字匹配、未匹配、幸运星和双倍符号分别计算', () => {
  const lucky = [3, 8, 19];
  assert.equal(reward({ type: 'number', number: 8, prize: 50 }, lucky), 50);
  assert.equal(reward({ type: 'number', number: 9, prize: 50 }, lucky), 0);
  assert.equal(reward({ type: 'star', number: 9, prize: 100 }, lucky), 100);
  assert.equal(reward({ type: 'double', number: 9, prize: 100 }, lucky), 200);
  assert.equal(reward({ type: 'double', number: 8, prize: 100 }, lucky), 200);
});

test('生成卡片的数字、格数、奖励范围符合规则', () => {
  let seed = 12345;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const types = new Set();
  for (let iteration = 0; iteration < 1000; iteration++) {
    const card = createCard(random);
    assert.equal(new Set(card.lucky).size, 3);
    assert.ok(card.lucky.every(number => Number.isInteger(number) && number >= 1 && number <= 30));
    assert.equal(card.cells.length, 24);
    for (const cell of card.cells) {
      types.add(cell.type);
      assert.ok(Number.isInteger(cell.number) && cell.number >= 1 && cell.number <= 30);
      assert.ok([10, 20, 50, 100, 200, 500].includes(cell.prize));
    }
  }
  assert.deepEqual([...types].sort(), ['double', 'number', 'star']);
});

test('中奖区间边界正确，普通未中奖数字不会意外匹配', () => {
  for (const [roll, type, wins] of [
    [0, 'star', true], [WIN_RATE * 0.3 - 1e-10, 'star', true],
    [WIN_RATE * 0.3, 'double', true], [WIN_RATE * 0.4 - 1e-10, 'double', true],
    [WIN_RATE * 0.4, 'number', true], [WIN_RATE - 1e-10, 'number', true],
    [WIN_RATE, 'number', false], [0.999999, 'number', false],
  ]) {
    let calls = 0;
    const card = createCard(() => { const call = calls++; return call >= 29 && (call - 29) % 3 === 0 ? roll : 0.5; });
    for (const cell of card.cells) {
      assert.equal(cell.type, type);
      assert.equal(reward(cell, card.lucky) > 0, wins);
    }
  }
});

test('固定种子抽样验证每格及整卡中奖率', () => {
  let seed = 45678;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  let winningCells = 0;
  let winningCards = 0;
  const count = 20000;
  for (let index = 0; index < count; index++) {
    const card = createCard(random);
    const wins = card.cells.filter(cell => reward(cell, card.lucky) > 0).length;
    winningCells += wins;
    if (wins > 0) winningCards++;
  }
  assert.ok(Math.abs(1 - (1 - WIN_RATE) ** CELL_COUNT - CARD_WIN_RATE) < 1e-12);
  assert.ok(Math.abs(winningCells / (count * CELL_COUNT) - WIN_RATE) < 0.001);
  assert.equal(CARD_WIN_RATE, 0.1);
  assert.ok(Math.abs(winningCards / count - CARD_WIN_RATE) < 0.01);
});
