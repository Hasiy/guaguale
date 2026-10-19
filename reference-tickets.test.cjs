const test = require('node:test');
const assert = require('node:assert/strict');
const { MODES, create, evaluate, expectedCount } = require('./reference-tickets.js');
const { PRICES, charge, credit } = require('./wallet.js');
test('全中区未中奖字样有变化，随机选择不包含中奖标志', () => {
  let seed = 123456;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const symbols = new Set();
  for (let index = 0; index < 500; index++) {
    const card = create('hundred20', random);
    const all = card.cells.find(cell => cell.type === 'all');
    if (all.word !== '赢') {
      assert.ok(['福', '禄', '寿', '喜', '安', '和', '吉', '顺'].includes(all.word));
      symbols.add(all.word);
    }
  }
  assert.equal(symbols.size, 8);
});
for (const [mode, config] of Object.entries(MODES)) {
  test(`${mode}: 区域完整、票价正确、整卡概率约10%、积分不超过票面上限`, () => {
    let seed = 56789;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    assert.equal(PRICES[mode], config.cost);
    assert.equal(charge(10000, mode, false).balance, 10000 - config.cost);
    let wins = 0;
    for (let count = 0; count < 10000; count++) {
      const card = create(mode, random);
      assert.equal(card.cells.length, expectedCount(mode));
      const indices = card.sections.flatMap(section => section.indices);
      assert.equal(new Set(indices).size, card.cells.length);
      const result = evaluate(card, new Set(indices));
      if (result.total > 0) wins++;
      assert.ok(result.total >= 0 && result.total <= config.maxValue);
      assert.equal(evaluate(card, new Set()).total, 0);
    }
    assert.ok(Math.abs(wins / 10000 - 0.1) < 0.015, `actual win rate: ${wins / 10000}`);
  });
}
test('号码需与已刮出的中奖号码匹配；666与倍数奖励独立生效', () => {
  const card = { cells: [{ type: 'lucky', number: 8 }, { type: 'number', number: 8, factor: 1, prize: 50 }, { type: 'number', number: 9, factor: 6, prize: 100 }] };
  assert.equal(evaluate(card, new Set([1])).total, 0);
  assert.equal(evaluate(card, new Set([0, 1])).total, 50);
  assert.equal(evaluate(card, new Set([2])).total, 600);
  assert.equal(evaluate(card, new Set([0, 1, 2])).total, 650);
});
test('全中区只计主区金额，部分揭晓的奖励可递增入账且不重复', () => {
  const card = { cells: [{ type: 'all', word: '赢' }, { type: 'multiplier', factor: 0, prize: 50 }, { type: 'multiplier', factor: 0, prize: 100 }] };
  assert.equal(evaluate(card, new Set([1, 2])).total, 0);
  const partial = evaluate(card, new Set([0, 1]));
  assert.equal(partial.total, 50);
  const first = credit(9980, partial.total, 0);
  const full = evaluate(card, new Set([0, 1, 2]));
  assert.equal(full.total, 150);
  assert.equal(credit(first.balance, full.total, first.credited).balance, 10130);
});
test('数字对奖的揭晓顺序不改变最终奖励，逐步结算只增加', () => {
  for (const mode of Object.keys(MODES)) {
    const card = create(mode, () => 0);
    const revealed = new Set();
    let prior = 0;
    for (let index = card.cells.length - 1; index >= 0; index--) {
      revealed.add(index);
      const total = evaluate(card, revealed).total;
      assert.ok(total >= prior);
      prior = total;
    }
    assert.ok(prior > 0);
  }
});
