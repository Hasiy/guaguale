(function (root) {
  'use strict';
  const reference = typeof module !== 'undefined' && module.exports ? require('./reference-tickets.js') : root.ReferenceTickets;
  const PRIZES = [10, 20, 50, 100, 200, 500];
  const CELL_COUNT = 24;
  const CARD_WIN_RATE = 0.1;
  const WIN_RATE = 1 - (1 - CARD_WIN_RATE) ** (1 / CELL_COUNT);
  function createSerial(random = Math.random) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const alphabet = letters + digits;
    const pick = source => source[Math.floor(random() * source.length)];
    const characters = [pick(letters), pick(digits), ...Array.from({ length: 14 }, () => pick(alphabet))];
    for (let index = characters.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [characters[index], characters[other]] = [characters[other], characters[index]];
    }
    return characters.join('');
  }
  function validateWinRate(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('中奖概率必须在 0 到 1 之间');
  }
  function createCard(random = Math.random, cardWinRate = CARD_WIN_RATE) {
    validateWinRate(cardWinRate);
    const winRate = 1 - (1 - cardWinRate) ** (1 / CELL_COUNT);
    const pool = Array.from({ length: 30 }, (_, index) => index + 1);
    for (let index = pool.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    const lucky = pool.slice(0, 3);
    const nonLucky = pool.slice(3);
    const cells = Array.from({ length: CELL_COUNT }, () => {
      const roll = random();
      // Convert the configured whole-card probability into independent cell probabilities.
      // Of winning outcomes, 30% are stars, 10% doubles and 60% matching numbers.
      const type = roll < winRate * 0.3 ? 'star' : roll < winRate * 0.4 ? 'double' : 'number';
      const numbers = roll < winRate ? lucky : nonLucky;
      return { type, number: numbers[Math.floor(random() * numbers.length)], prize: PRIZES[Math.floor(random() * PRIZES.length)] };
    });
    return { lucky, cells, winRate: cardWinRate };
  }
  function reward(cell, lucky) {
    if (cell.type === 'double') return cell.prize * 2;
    if (cell.type === 'star' || lucky.includes(cell.number)) return cell.prize;
    return 0;
  }
  function createVariantCard(mode, random = Math.random, cardWinRate = CARD_WIN_RATE) {
    validateWinRate(cardWinRate);
    if (reference.MODES[mode]) return reference.create(mode, random, cardWinRate);
    if (mode === 'lucky') return { ...createCard(random, cardWinRate), mode, groups: [] };
    if (!['triple', 'duel'].includes(mode)) throw new Error('Unknown game mode');
    const groupCount = mode === 'triple' ? 8 : 12;
    const groupWinRate = 1 - (1 - cardWinRate) ** (1 / groupCount);
    const cells = [];
    const groups = [];
    const pickPrize = () => PRIZES[Math.floor(random() * PRIZES.length)];
    for (let index = 0; index < groupCount; index++) {
      const wins = random() < groupWinRate;
      const indices = [];
      if (mode === 'triple') {
        const first = pickPrize();
        const second = wins ? first : pickPrize();
        const alternatives = PRIZES.filter(value => value !== first);
        const third = wins ? first : first === second
          ? alternatives[Math.floor(random() * alternatives.length)] : pickPrize();
        for (const amount of [first, second, third]) {
          indices.push(cells.length);
          cells.push({ type: 'amount', amount });
        }
        groups.push({ indices });
      } else {
        const bank = wins ? Math.floor(random() * 29) + 1 : Math.floor(random() * 30) + 1;
        const mine = wins ? bank + 1 + Math.floor(random() * (30 - bank)) : Math.floor(random() * bank) + 1;
        for (const [role, number] of [['我的', mine], ['庄家', bank]]) {
          indices.push(cells.length);
          cells.push({ type: 'duel-number', number, role });
        }
        groups.push({ indices, prize: pickPrize() });
      }
    }
    return { mode, lucky: [], cells, groups, winRate: cardWinRate };
  }
  function evaluateCard(card, revealed) {
    if (reference.MODES[card.mode]) return reference.evaluate(card, revealed);
    let total = 0;
    const winningIndices = [];
    if (!card.mode || card.mode === 'lucky') {
      for (const index of revealed) {
        const points = reward(card.cells[index], card.lucky);
        total += points;
        if (points > 0) winningIndices.push(index);
      }
    } else {
      for (const group of card.groups) {
        if (!group.indices.every(index => revealed.has(index))) continue;
        const values = group.indices.map(index => card.cells[index]);
        const points = card.mode === 'triple'
          ? values.every(cell => cell.amount === values[0].amount) ? values[0].amount : 0
          : values[0].number > values[1].number ? group.prize : 0;
        total += points;
        if (points > 0) winningIndices.push(...group.indices);
      }
    }
    return { total, winningIndices };
  }
  const api = { createCard, createVariantCard, evaluateCard, createSerial, reward, CELL_COUNT, WIN_RATE, CARD_WIN_RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScratchGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
