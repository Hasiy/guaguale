(function (root) {
  'use strict';
  const MODES = {
    shun10: { name: '顺顺利利', title: '顺', cost: 10, color: '#078b88', seal: '步步顺', style: 'shun', wordCount: 20, numberCount: 0, luckyCount: 0, cols: 5, max: '250,000', maxValue: 250000, cover: 'charm', tagline: '顺顺利利 · 刮出金额即中奖', rules: '刮开喜字区，出现金额即获得该格积分，出现祝福语则未中奖。所有中奖积分累加。' },
    shun20: { name: '一帆风顺', title: '顺', cost: 20, color: '#cc570d', seal: '时时顺', style: 'shun', wordCount: 0, numberCount: 25, luckyCount: 2, cols: 5, max: '1,000,000', maxValue: 1000000, cover: 'cloud', tagline: '一帆风顺 · 25 次数字对奖机会', multipliers: [6], rules: '你的号码与任一中奖号码相同，获得该格积分；出现「666」标志，获得该格积分的 6 倍。中奖号码也需刮开，多处中奖可累加。' },
    shun30: { name: '万事顺遂', title: '顺', cost: 30, color: '#a20f8e', seal: '紫气顺', style: 'shun', wordCount: 20, numberCount: 15, luckyCount: 2, cols: 5, max: '1,000,000', maxValue: 1000000, cover: 'charm', tagline: '万事顺遂 · 喜字寻奖＋幸运号码', multipliers: [6], rules: '游戏一：喜字区出现金额即获得该格积分。游戏二：你的号码与任一中奖号码相同，获得对应积分；出现「666」获得对应积分的 6 倍。两区奖励累加。' },
    shun50: { name: '顺意满满', title: '顺', cost: 50, color: '#cb1239', seal: '福气顺', style: 'shun', wordCount: 20, numberCount: 30, luckyCount: 2, cols: 5, max: '1,000,000', maxValue: 1000000, cover: 'charm', tagline: '顺意满满 · 双区畅刮 50 格', multipliers: [6], rules: '游戏一：喜字区出现金额即获得该格积分。游戏二：号码匹配即获得对应积分；出现「666」获得对应积分的 6 倍。两区分别判定，中奖积分累加。' },
    hot20: { name: '红红火火', title: '红红<br>火火', cost: 20, color: '#df0714', seal: '好运来', style: 'hot', wordCount: 0, numberCount: 16, luckyCount: 3, bonuses: [50, 50, 100, 100], cols: 4, max: '1,000,000', maxValue: 1000000, cover: 'lantern', tagline: '四重加奖 · 共 20 次中奖机会', multipliers: [2, 5, 10, 20, 50], rules: '游戏一、二：加奖区刮出「中50」或「中100」即获得对应积分。游戏三：你的号码匹配中奖号码，即获得对应积分；刮出倍数标志，获得对应积分乘以该倍数。各区奖励累加。' },
    hundred20: { name: '100X 超级加倍', title: '100<span>X</span>', cost: 20, color: '#b90e37', seal: '超级加倍', style: 'hundred', wordCount: 0, numberCount: 20, luckyCount: 0, winAll: true, cols: 5, max: '1,000,000', maxValue: 1000000, cover: 'silver', tagline: '1 · 2 · 5 · 10 · 20 · 50 · 100 倍惊喜', multipliers: [1, 2, 5, 10, 20, 50, 100], rules: '主区出现倍数标志，获得该格积分乘以倍数；全中区出现「赢」，获得主区 20 格标示积分之和，每格只计一次。全中与倍数不叠加。' },
    newyear50: { name: '新春大吉2026', title: '新春大吉<span>2026</span>', cost: 50, color: '#db0618', seal: '马年大吉', style: 'newyear', wordCount: 15, numberCount: 24, luckyCount: 2, cols: 6, max: '1,000,000', maxValue: 1000000, cover: 'horse', tagline: '马年新春大吉 · 双区同刮', multipliers: [5], rules: '左侧喜字区出现金额即中奖。右侧你的号码与任一中奖号码相同，即获得该格积分；刮出「5倍」，获得对应积分的 5 倍。两区奖励累加。' },
  };
  const BLESSINGS = ['顺利', '顺心', '顺意', '顺势', '顺达', '顺境', '顺畅', '顺水', '顺风', '顺安', '顺成', '顺宁', '顺发', '顺和', '顺时', '百顺', '通顺', '康顺', '昌顺', '永顺'];
  const ICONS = ['冠', '礼', '铃', '贝', '花', '玉', '珠', '帆', '瓶', '星'];
  const pick = (items, random) => items[Math.floor(random() * items.length)];
  function prize(config, random, winning, factor = 1) {
    const cap = config.maxValue / factor;
    const pool = [config.cost, 50, 100, 200, 500, 1000, 10000, config.maxValue].filter(value => value <= cap);
    // Most awarded prizes are small; the top tier remains possible, but rare.
    if (winning) {
      const roll = random();
      if (roll < 0.95) return pick(pool.slice(0, Math.min(3, pool.length)), random);
      if (roll < 0.999) return pick(pool.slice(0, Math.min(6, pool.length)), random);
    }
    return pick(pool, random);
  }
  function create(mode, random = Math.random, cardWinRate = 0.1) {
    if (!Number.isFinite(cardWinRate) || cardWinRate < 0 || cardWinRate > 1) throw new RangeError('中奖概率必须在 0 到 1 之间');
    const config = MODES[mode];
    const cells = [];
    const sections = [];
    const lucky = [];
    const pool = Array.from({ length: 60 }, (_, index) => index + 1);
    for (let index = pool.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    lucky.push(...pool.slice(0, config.luckyCount));
    function section(kind, title, columns, values, cover) {
      if (!values.length) return;
      const indices = values.map(value => { cells.push(value); return cells.length - 1; });
      sections.push({ kind, title, columns, indices, cover });
    }
    section('words', config.numberCount ? '游戏一 · 喜字寻奖' : '刮开区 · 喜字寻奖', mode === 'newyear50' ? 3 : 5,
      Array.from({ length: config.wordCount }, (_, index) => ({ type: 'blessing', word: BLESSINGS[index % BLESSINGS.length], prize: 0 })), 'charm');
    section('bonus', '游戏一、二 · 加奖区', 4,
      (config.bonuses || []).map(amount => ({ type: 'bonus', target: amount, prize: 0, word: '好运' })), 'flame');
    if (config.winAll) section('all', '全中区 · 刮出「赢」全中', 1, [{ type: 'all', word: pick(['福', '禄', '寿', '喜', '安', '和', '吉', '顺'], random), prize: 0 }], 'silver');
    section('lucky', '中奖号码', config.luckyCount, lucky.map(number => ({ type: 'lucky', number, prize: 0 })), 'cloud');
    const mainKind = mode === 'hundred20' ? 'multiplier' : 'number';
    section('numbers', mode === 'hundred20' ? '主游戏 · 倍数奖励' : config.bonuses ? '游戏三 · 你的号码' : config.wordCount ? '游戏二 · 你的号码' : '你的号码', config.cols,
      Array.from({ length: config.numberCount }, () => ({ type: mainKind, number: pick(pool.slice(config.luckyCount), random), word: pick(ICONS, random), factor: 0, prize: prize(config, random, false) })), config.cover === 'charm' ? 'cloud' : config.cover);
    const eligible = cells.map((cell, index) => cell.type !== 'lucky' ? index : -1).filter(index => index >= 0);
    if (random() < cardWinRate) {
      const winner = cells[pick(eligible, random)];
      if (winner.type === 'blessing' || winner.type === 'bonus') {
        winner.prize = winner.target || prize(config, random, true);
      } else if (winner.type === 'all') {
        winner.word = '赢';
        // Win-all pays the sum of displayed base values, bounded by the headline maximum.
        const main = cells.filter(cell => cell.type === 'multiplier');
        for (const cell of main) cell.prize = Math.min(cell.prize, Math.floor(config.maxValue / main.length));
      } else {
        winner.factor = winner.type === 'multiplier' || random() < 0.2 ? pick(config.multipliers || [1], random) : 1;
        if (winner.type === 'number' && winner.factor === 1) winner.number = pick(lucky, random);
        winner.prize = prize(config, random, true, winner.factor);
      }
    }
    return { mode, lucky, cells, sections, groups: [], reference: true, winRate: cardWinRate };
  }
  function evaluate(card, revealed) {
    const winningIndices = [];
    let total = 0;
    const allIndex = card.cells.findIndex(cell => cell.type === 'all' && cell.word === '赢');
    const winAll = allIndex >= 0 && revealed.has(allIndex);
    if (winAll) winningIndices.push(allIndex);
    for (const index of revealed) {
      const cell = card.cells[index];
      let value = 0;
      if (cell.type === 'blessing' || cell.type === 'bonus') value = cell.prize;
      else if (cell.type === 'number') {
        const matched = card.cells.some((other, luckyIndex) => other.type === 'lucky' && revealed.has(luckyIndex) && other.number === cell.number);
        value = matched || cell.factor > 1 ? cell.prize * (cell.factor || 1) : 0;
      }
      else if (cell.type === 'multiplier') value = winAll ? cell.prize : cell.prize * cell.factor;
      if (value > 0) { total += value; winningIndices.push(index); }
    }
    return { total, winningIndices };
  }
  function expectedCount(mode) {
    const config = MODES[mode];
    return config ? config.wordCount + config.numberCount + config.luckyCount + (config.bonuses?.length || 0) + (config.winAll ? 1 : 0) : 24;
  }
  const api = { MODES, create, evaluate, expectedCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReferenceTickets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
