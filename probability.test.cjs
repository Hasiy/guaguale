const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const reference = require('./reference-tickets.js');
const modes = ['lucky', 'triple', 'duel', ...Object.keys(reference.MODES)];
function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}
function wins(card) {
  return game.evaluateCard(card, new Set(card.cells.map((_, index) => index))).total > 0;
}
for (const mode of modes) {
  test(`${mode}: 0% 没有中奖，100% 每张至少中奖一次`, () => {
    const random = seeded(129);
    for (const rate of [0, 1]) {
      for (let index = 0; index < 80; index++) {
        const card = game.createVariantCard(mode, random, rate);
        assert.equal(card.winRate, rate);
        assert.equal(wins(card), Boolean(rate));
      }
    }
  });
  test(`${mode}: 整张中奖率跟随配置，而非按每格重复使用整张概率`, () => {
    const random = seeded(417);
    for (const rate of [0.05, 0.35, 0.8]) {
      const count = 2400;
      let won = 0;
      for (let index = 0; index < count; index++) won += Number(wins(game.createVariantCard(mode, random, rate)));
      assert.ok(Math.abs(won / count - rate) < 0.04, `${mode}: target=${rate}, actual=${won / count}`);
    }
  });
}
test('拒绝非法概率，默认仍为10%，新配置不修改已生成票券', () => {
  const oldCard = game.createVariantCard('shun20', seeded(7));
  const before = JSON.stringify(oldCard);
  for (const rate of [-1, 1.01, Infinity, NaN, null, '0.5']) {
    for (const mode of modes) assert.throws(() => game.createVariantCard(mode, Math.random, rate), RangeError);
    assert.throws(() => game.createCard(Math.random, rate), RangeError);
    assert.throws(() => reference.create('shun20', Math.random, rate), RangeError);
  }
  game.createVariantCard('shun20', seeded(7), 1);
  assert.equal(JSON.stringify(oldCard), before);
  assert.equal(oldCard.winRate, 0.1);
});
