const test = require('node:test');
const assert = require('node:assert/strict');
const { charge, credit } = require('./wallet.js');
test('三种票券各扣10、20、50积分，重复刮开不重复扣款', () => {
  for (const [mode, cost] of [['lucky', 10], ['triple', 20], ['duel', 50]]) {
    const paid = charge(10000, mode, false);
    assert.equal(paid.balance, 10000 - cost);
    assert.equal(paid.spent, cost);
    assert.equal(charge(paid.balance, mode, paid.paid).balance, paid.balance);
  }
});
test('已入账奖励不重复结算，后续奖励累加', () => {
  const first = credit(9990, 100, 0);
  assert.equal(first.balance, 10090);
  assert.equal(credit(first.balance, 100, first.credited).balance, 10090);
  assert.equal(credit(first.balance, 150, first.credited).balance, 10140);
});
test('积分不足时拒绝扣款，刚好足够可扣至零', () => {
  assert.throws(() => charge(49, 'duel', false), /积分不足/);
  assert.equal(charge(50, 'duel', false).balance, 0);
});
