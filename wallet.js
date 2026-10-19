(function (root) {
  'use strict';
  const PRICES = Object.freeze({ lucky: 10, triple: 20, duel: 50, shun10: 10, shun20: 20, shun30: 30, shun50: 50, hot20: 20, hundred20: 20, newyear50: 50 });
  function charge(balance, mode, paid) {
    if (paid) return { balance, paid: true, spent: 0 };
    const price = PRICES[mode];
    if (!price || balance < price) throw new Error('积分不足');
    return { balance: balance - price, paid: true, spent: price };
  }
  function credit(balance, total, credited) {
    if (total < credited) throw new Error('结算金额异常');
    return { balance: balance + total - credited, credited: total, earned: total - credited };
  }
  const api = { PRICES, charge, credit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScratchWallet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
