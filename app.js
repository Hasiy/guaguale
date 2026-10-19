'use strict';
const grid = document.querySelector('#scratch-grid');
const revealButton = document.querySelector('#reveal-all');
const ticket = document.querySelector('.ticket');
const androidHost = location.hostname === 'appassets.androidplatform.net';
if (androidHost) {
  document.body.classList.add('android-app');
  document.querySelector('.ledger > p').textContent = '积分和已揭晓进度保存在本机应用内；重启或覆盖安装会保留，卸载或清除应用数据后会丢失。尚未接入登录与云端账号。';
  document.querySelector('.brand').removeAttribute('href');
}
if (matchMedia('(pointer: coarse)').matches) {
  document.querySelector('.interaction-tip').textContent = '用手指来回刮开涂层 · 上下滑动票面边缘浏览';
}
// Native selection can paint concealed text above the canvas coating.
ticket.addEventListener('selectstart', event => event.preventDefault());
ticket.addEventListener('dragstart', event => event.preventDefault());
let card;
let mode = 'lucky';
const STORAGE_KEY = 'scratch-account-v1';
const SETTINGS_KEY = 'scratch-settings-v1';
let configuredWinRate = ScratchGame.CARD_WIN_RATE;
let account;
let serial;
let paid = false;
let credited = 0;
let revision = 0;
let storageReady = true;
const modes = {
  lucky: { title: '幸运<span>加倍</span>', name: '幸运加倍', edition: 'LUCKY NUMBERS · DOUBLE YOUR LUCK', max: '1,000', label: '单格最高', tagline: '24 次揭晓机会 · 数字对上就有奖', grid: '你的号码', legend: '<span><b>★</b> 直接中奖</span><span><b>×2</b> 对应积分翻倍</span>', rules: '「你的号码」与任一「幸运号码」相同，即获得该格标示积分；刮出 ★ 直接获得该格积分；刮出 ×2 获得该格积分的 2 倍。中奖积分可累加。' },
  triple: { title: '三同<span>好礼</span>', name: '三同好礼', edition: 'TRIPLE MATCH · THREE OF A KIND', max: '500', label: '每组最高', tagline: '8 组独立游戏 · 三个相同就有奖', grid: '刮出三个相同金额', legend: '<span><b>50 · 50 · 50</b> = 50 积分</span>', rules: '每组包含 3 个金额。同一组刮出 3 个相同金额，即获得该金额的积分，只计一次，不是三倍。不同组不可混合配对，多组中奖可累加。' },
  duel: { title: '数字<span>对决</span>', name: '数字对决', edition: 'NUMBER DUEL · HIGHER WINS', max: '500', label: '每组最高', tagline: '12 组数字对决 · 大过庄家就有奖', grid: '我的数字 vs 庄家数字', legend: '<span><b>我的 ＞ 庄家</b> 获得该组积分</span>', rules: '每组分别刮开「我的」和「庄家」数字。「我的」数字严格大于「庄家」，获得该组标示积分；小于或等于均未中奖。每组独立比较，多组中奖可累加。' },
};
for (const [key, config] of Object.entries(ReferenceTickets.MODES)) {
  modes[key] = { ...config, edition: 'LUCKY COLLECTION · ORIGINAL SIMULATION', grid: '刮开区', label: '最高积分', legend: '<span>中奖积分兼中兼得 · 虚拟试玩</span>' };
}
const refinedColors = { shun10: '#006963', shun20: '#ac491f', shun30: '#70244f', shun50: '#a8203d', hot20: '#ae1522', hundred20: '#64122e', newyear50: '#991c29' };
for (const [key, color] of Object.entries(refinedColors)) modes[key].color = color;
const catalog = [...Object.keys(ReferenceTickets.MODES), 'lucky', 'triple', 'duel'];
document.querySelector('.game-picker').innerHTML = catalog.map(key => `<button type="button" data-game="${key}" aria-pressed="false" style="--cover-color:${modes[key].color || '#7f2525'}"><span class="mini-cover">${modes[key].style === 'shun' ? '顺' : key === 'hundred20' ? '100X' : key === 'hot20' ? '火' : key === 'newyear50' ? '吉' : '✦'}</span>${modes[key].name}<small>${ScratchWallet.PRICES[key]} 积分 / 张</small></button>`).join('');
let revealed = new Set();
let revealActions = [];
const scratchLayers = new Map();
const scratchGesture = ScratchGesture.attach(grid, {
  getLayers: () => [...scratchLayers.values()],
  canStart: ensurePaid,
});
const formatNumber = value => String(value).padStart(2, '0');

function notice(message) { document.querySelector('#account-notice').textContent = message; }
function saveAccount() {
  try {
    revision++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, revision, account, session: { card, serial, paid, credited, revealed: [...revealed] } }));
    return true;
  } catch {
    storageReady = false;
    notice('浏览器无法保存积分，请允许网站存储后刷新；已暂停刮奖。');
    return false;
  }
}
function record(change, reason) {
  account.history.unshift({ change, reason, serial, at: new Date().toISOString() });
  account.history = account.history.slice(0, 30);
}
function renderAccount() {
  document.querySelector('#account-id').textContent = `ID ${account.id}`;
  document.querySelector('#balance').textContent = account.balance.toLocaleString('zh-CN');
  document.querySelector('#ticket-balance').textContent = account.balance.toLocaleString('zh-CN');
  document.querySelector('#ledger-list').replaceChildren(...account.history.map(entry => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = entry.reason;
    const amount = document.createElement('strong');
    amount.textContent = `${entry.change > 0 ? '+' : ''}${entry.change.toLocaleString('zh-CN')}`;
    amount.className = entry.change > 0 ? 'income' : 'expense';
    item.title = `${entry.at}${entry.serial ? ` · ${entry.serial}` : ''}`;
    item.append(label, amount);
    return item;
  }));
}
function ensurePaid() {
  if (!storageReady) return false;
  // Avoid overwriting a newer account state from another tab.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.revision !== revision) {
      restore(saved); renderCard();
      notice('账号已在其他页面更新，已同步最新进度，请重新操作。');
      return false;
    }
  } catch { storageReady = false; notice('无法读取账号存储，已暂停刮奖。'); return false; }
  if (paid) return true;
  try {
    const result = ScratchWallet.charge(account.balance, mode, paid);
    account.balance = result.balance;
    paid = result.paid;
    record(-result.spent, `${modes[mode].name} · 刮卡消费`);
    if (!saveAccount()) return false;
    notice(`本张已扣除 ${result.spent} 积分，继续刮开不再扣款。`);
    renderAccount();
    updateResult();
    return true;
  } catch { notice(`积分不足，本券需要 ${ScratchWallet.PRICES[mode]} 积分。`); return false; }
}

function updateResult() {
  const count = revealed.size;
  const finished = count === card.cells.length;
  const { total, winningIndices } = ScratchGame.evaluateCard(card, revealed);
  if (paid && total > credited) {
    const result = ScratchWallet.credit(account.balance, total, credited);
    account.balance = result.balance;
    credited = result.credited;
    record(result.earned, `${modes[mode].name} · 中奖入账`);
    saveAccount();
    renderAccount();
  }
  const winners = new Set(winningIndices);
  for (const index of revealed) {
    const tile = grid.querySelector(`[data-index="${index}"]`);
    const group = card.groups.find(group => group.indices.includes(index));
    const complete = !group || group.indices.every(cellIndex => revealed.has(cellIndex));
    tile.classList.toggle('winner', winners.has(index));
    const cell = card.cells[index];
    const waitingLucky = card.reference && cell.type === 'number' && cell.factor <= 1 && !winners.has(index) && card.cells.some((other, i) => other.type === 'lucky' && !revealed.has(i));
    tile.querySelector('.cell-state').textContent = cell.type === 'lucky' ? '对奖号码' : !complete ? '待同组揭晓' : waitingLucky ? '待号码揭晓' : winners.has(index) ? '中奖' : '未中奖';
  }
  document.querySelector('#progress').textContent = `已刮开 ${count} / ${card.cells.length}`;
  document.querySelector('#total').textContent = count ? total.toLocaleString('zh-CN') : '—';
  document.querySelector('#result-title').textContent = finished ? total > 0 ? '今天的好运，已到账！' : '下一张，好运继续' : '好运，等待揭晓';
  document.querySelector('#result-message').textContent = finished
    ? total > 0 ? `本张共获得 ${total.toLocaleString('zh-CN')} 积分。愿这份小幸运陪你一整天。` : '这张没有中奖，换一张继续探索吧。'
    : count ? `已揭晓 ${count} 格，当前获得 ${total} 积分。继续刮开剩余区域吧。` : `刮开全部 ${card.cells.length} 格，看看今天收获多少惊喜。`;
  revealButton.disabled = finished;
  revealButton.innerHTML = finished ? '本张已全部揭晓 <span aria-hidden="true">✓</span>' : '一键刮开 <span aria-hidden="true">↗</span>';
  const inProgress = paid && !finished;
  document.querySelector('#new-card').disabled = inProgress;
  document.querySelectorAll('[data-game]').forEach(button => { button.disabled = inProgress && button.dataset.game !== mode; });
  const resume = document.querySelector('#resume-ticket');
  resume.hidden = !inProgress;
  resume.firstChild.textContent = `继续刮「${modes[mode].name}」 · ${count} / ${card.cells.length} `;
  document.querySelector('#cost-note').textContent = inProgress ? '本张已付费，请刮完或一键揭晓后再换券' : `本券 ${ScratchWallet.PRICES[mode]} 积分 · 首次刮开扣款 · 中奖自动累加到账`;
}

function addScratchLayer(tile, index) {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', `刮开第 ${index + 1} 格，按回车或空格揭晓`);
  tile.append(canvas);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  // Fixed logical size preserves scratch progress when the page resizes.
  canvas.width = 300;
  canvas.height = 270;
  const coating = context.createLinearGradient(0, 0, 300, 270);
  coating.addColorStop(0, '#b7babd');
  coating.addColorStop(0.35, '#e0e2e3');
  coating.addColorStop(0.65, '#c4c7ca');
  coating.addColorStop(1, '#aeb2b6');
  context.fillStyle = coating;
  context.fillRect(0, 0, 300, 270);
  context.strokeStyle = '#83898f35';
  for (let offset = -270; offset < 300; offset += 23) {
    context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset + 270, 270); context.stroke();
  }
  context.fillStyle = '#73787d';
  context.textAlign = 'center';
  context.font = '26px sans-serif';
  context.fillText('好运', 150, 118);
  context.font = 'bold 25px sans-serif';
  context.fillText('刮 奖 区', 150, 161);
  if (card.reference && tile.dataset.cover === 'silver') {
    context.fillStyle = '#b5d7dd';
    context.fillRect(0, 0, 300, 270);
    context.strokeStyle = '#8a89b373';
    context.lineWidth = 2;
    for (let y = -80; y < 350; y += 27) {
      context.beginPath(); context.moveTo(0, y); context.bezierCurveTo(90, y - 60, 210, y + 60, 300, y); context.stroke();
    }
    context.save();
    context.translate(150, 135); context.rotate(-0.35);
    context.fillStyle = '#617b9e77'; context.font = '13px sans-serif';
    for (let y = -170; y < 190; y += 35) context.fillText('LUCKY · 好运票社 · LUCKY', 0, y);
    context.restore();
    context.fillStyle = '#435c74'; context.font = 'bold 28px sans-serif';
    context.fillText(card.cells[index].type === 'all' ? '全 中 区' : '刮 开 好 运', 150, 145);
  }
  if (card.reference && tile.dataset.cover !== 'silver') {
    const field = context.createRadialGradient(150, 85, 5, 150, 140, 230);
    field.addColorStop(0, modes[mode].color);
    field.addColorStop(1, '#15231f');
    context.fillStyle = field;
    context.fillRect(0, 0, 300, 270);
    context.strokeStyle = '#ffe5a417';
    context.lineWidth = 1.5;
    for (let y = -20; y < 320; y += 28) {
      context.beginPath(); context.moveTo(0, y); context.bezierCurveTo(80, y - 32, 220, y + 32, 300, y); context.stroke();
    }
    const foil = context.createLinearGradient(60, 40, 230, 230);
    foil.addColorStop(0, '#f6e3a9'); foil.addColorStop(0.45, '#d5b56c'); foil.addColorStop(0.7, '#ffeec3'); foil.addColorStop(1, '#b8914a');
    context.fillStyle = foil;
    context.strokeStyle = foil;
    context.lineWidth = 3;
    const cover = tile.dataset.cover;
    if (cover === 'charm') {
      context.stroke(new Path2D('M112 54 L188 54 Q188 70 204 70 L204 148 Q188 148 188 164 L112 164 Q112 148 96 148 L96 70 Q112 70 112 54 Z'));
      context.font = 'bold 78px KaiTi, serif';
      context.fillText(['顺', '万', '顺', '一', '风', '风', '事', '心', '顺', '调', '顺', '顺', '如', '百', '雨', '水', '遂', '意', '顺', '顺'][index % 20], 150, 139);
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(150, 164); context.lineTo(150, 207); context.stroke();
      for (let x = 140; x <= 160; x += 4) { context.beginPath(); context.moveTo(150, 203); context.lineTo(x, 232); context.stroke(); }
    } else if (cover === 'lantern') {
      context.fillRect(120, 54, 60, 10);
      context.beginPath(); context.ellipse(150, 124, 66, 56, 0, 0, Math.PI * 2); context.stroke();
      for (const radius of [23, 45]) { context.beginPath(); context.ellipse(150, 124, radius, 56, 0, 0, Math.PI * 2); context.stroke(); }
      context.fillRect(120, 184, 60, 8);
      context.beginPath(); context.moveTo(150, 192); context.lineTo(150, 226); context.stroke();
      context.font = 'bold 26px sans-serif'; context.fillText('奖 金', 150, 258);
    } else if (cover === 'flame') {
      context.fill(new Path2D('M148 34 C166 78 217 92 207 146 C204 185 170 201 148 201 C102 201 79 177 90 138 C99 110 125 98 121 67 C142 83 144 101 143 119 C174 91 154 60 148 34 Z'));
      context.fillStyle = modes[mode].color;
      context.fill(new Path2D('M151 116 C171 137 181 145 175 165 C170 183 141 189 131 168 C121 151 139 138 151 116 Z'));
      context.fillStyle = foil;
      context.font = 'bold 31px Georgia, serif'; context.fillText(`${card.cells[index].target} 分`, 150, 250);
    } else {
      if (cover === 'horse') {
        const horse = new Path2D('M65 115 C90 95 120 105 155 110 L180 80 L190 48 L204 70 L232 88 L220 104 L202 100 L191 132 L169 150 L202 166 L232 158 L236 172 L200 183 L157 160 L139 157 L115 184 L71 193 L64 182 L101 170 L111 144 L85 145 L60 170 L22 165 L24 153 L52 154 L63 133 C45 128 35 110 22 109 C38 100 54 102 65 115 Z');
        context.fill(horse);
      } else {
        const cloud = new Path2D('M67 133 C35 129 37 94 66 94 C64 61 104 53 122 77 C137 38 194 51 192 87 C220 70 251 99 236 124 C267 136 249 164 220 164 L105 164 C82 164 77 183 99 188 C122 193 143 182 153 170 M80 140 C94 130 118 139 119 151 M146 117 C136 98 162 83 178 96 C192 107 182 126 168 124');
        context.lineWidth = 5; context.lineCap = 'round'; context.stroke(cloud);
        context.lineWidth = 1.5;
        context.beginPath(); context.moveTo(74, 208); context.lineTo(226, 208); context.stroke();
      }
      context.font = '19px sans-serif';
      context.fillText(card.cells[index].type === 'lucky' ? '中 奖 号 码' : '好 运 常 在', 150, 244);
    }
  }
  let lastCheck = 0;
  function reveal() {
    if (revealed.has(index)) return;
    if (!ensurePaid()) return;
    const hadFocus = document.activeElement === canvas;
    revealed.add(index);
    scratchLayers.delete(canvas);
    canvas.remove();
    tile.querySelector('.cell-content').removeAttribute('aria-hidden');
    updateResult();
    saveAccount();
    if (hadFocus) {
      const nextCanvas = grid.querySelector('canvas');
      (nextCanvas || document.querySelector('#new-card')).focus({ preventScroll: true });
    }
  }
  function checkCoverage() {
    if (revealed.has(index)) return;
    const pixels = context.getImageData(0, 0, 300, 270).data;
    let clear = 0;
    let samples = 0;
    for (let y = 4; y < 270; y += 8) {
      for (let x = 4; x < 300; x += 8) {
        samples++;
        if (pixels[(y * 300 + x) * 4 + 3] < 128) clear++;
      }
    }
    if (clear / samples >= 0.45) reveal();
  }
  function scratch(from, to, rect, time) {
    if (revealed.has(index)) return;
    const start = { x: (from.x - rect.left) / rect.width * 300, y: (from.y - rect.top) / rect.height * 270 };
    const point = { x: (to.x - rect.left) / rect.width * 300, y: (to.y - rect.top) / rect.height * 270 };
    context.globalCompositeOperation = 'destination-out';
    context.lineWidth = 58;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath(); context.arc(point.x, point.y, 29, 0, Math.PI * 2); context.fill();
    if (time - lastCheck > 120) { checkCoverage(); lastCheck = time; }
  }
  scratchLayers.set(canvas, { getRect: () => canvas.getBoundingClientRect(), scratch, checkCoverage });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reveal(); }
  });
  revealActions.push(reveal);
}

function newCard() {
  if (paid && revealed.size < card.cells.length) return;
  revealed = new Set();
  paid = false;
  credited = 0;
  card = ScratchGame.createVariantCard(mode, Math.random, configuredWinRate);
  serial = ScratchGame.createSerial();
  renderCard();
  saveAccount();
}
function renderCard() {
  scratchGesture.cancel(false);
  scratchLayers.clear();
  revealActions = [];
  const config = modes[mode];
  document.body.classList.toggle('collection-view', Boolean(card.reference));
  ticket.dataset.mode = mode;
  ticket.dataset.style = config.style || 'classic';
  ticket.classList.toggle('reference-ticket', Boolean(card.reference));
  ticket.style.setProperty('--ticket-color', config.color || '#b81523');
  document.querySelector('main').classList.toggle('wide-ticket', config.style === 'newyear');
  document.querySelector('.reference-brand').hidden = !card.reference;
  document.querySelector('.ticket-topline').hidden = Boolean(card.reference);
  document.querySelector('#ticket-seal').textContent = config.seal || '';
  const hero = document.querySelector('.hero-art');
  hero.src = config.style === 'newyear' ? 'assets/horse-gold-v2.png' : 'assets/shun-gold-v2.png';
  hero.hidden = !['shun', 'newyear'].includes(config.style);
  document.querySelector('.collection-kicker').textContent = config.style === 'shun' ? `${config.name} · 东方祈愿系列` : config.style === 'newyear' ? '丙午新春 · 骏马迎福' : config.style === 'hundred' ? 'MULTIPLY YOUR MOMENT' : '喜事临门 · 好运相随';
  document.querySelector('#face-value').textContent = `${ScratchWallet.PRICES[mode]} 积分`;
  ticket.setAttribute('aria-label', `${config.name}刮刮卡`);
  document.title = `${config.name} · 刮刮乐试玩`;
  document.querySelector('#ticket-page-title').textContent = config.name;
  document.querySelector('#game-title').innerHTML = config.title;
  document.querySelector('.edition').textContent = config.edition;
  document.querySelector('#max-prize').textContent = config.max;
  document.querySelector('#footer-prize').textContent = config.max;
  document.querySelector('#prize-label').textContent = config.label;
  document.querySelector('.ticket-tagline').textContent = config.tagline;
  document.querySelector('#grid-title').textContent = config.grid;
  document.querySelector('.symbol-legend').innerHTML = config.legend;
  document.querySelector('#game-rules').textContent = config.rules;
  document.querySelector('.lucky-strip').hidden = mode !== 'lucky';
  document.querySelectorAll('[data-game]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.game === mode)));
  document.querySelector('#card-number').textContent = `NO. ${serial}`;
  document.querySelector('#lucky-numbers').innerHTML = card.lucky.map(number => `<span class="lucky-number">${formatNumber(number)}</span>`).join('');
  grid.replaceChildren();
  grid.className = `scratch-grid mode-${mode}`;
  const sectionContainers = (card.sections || []).map(section => {
    const container = document.createElement('section');
    container.className = `reference-section section-${section.kind}`;
    container.setAttribute('aria-label', section.title);
    container.innerHTML = `<h3>${section.title}</h3><div class="reference-cells" style="--columns:${section.columns}"></div>`;
    grid.append(container);
    return container.querySelector('.reference-cells');
  });
  const groupContainers = card.groups.map((group, index) => {
    const container = document.createElement('section');
    container.className = 'scratch-group';
    container.setAttribute('aria-label', `第 ${index + 1} 组`);
    container.innerHTML = `<div class="group-label">第 ${String(index + 1).padStart(2, '0')} 组${mode === 'duel' ? `<span>奖励 ${group.prize} 积分</span>` : ''}</div><div class="group-cells"></div>`;
    grid.append(container);
    return container.querySelector('.group-cells');
  });
  card.cells.forEach((cell, index) => {
    const tile = document.createElement('div');
    tile.className = 'scratch-cell';
    tile.dataset.index = index;
    let value = cell.type === 'amount' ? cell.amount : cell.type === 'star' ? '★' : cell.type === 'double' ? '×2' : formatNumber(cell.number);
    let caption = mode === 'triple' ? '积分' : mode === 'duel' ? cell.role : `${cell.prize} 积分`;
    if (card.reference) {
      if (cell.type === 'blessing') { value = cell.prize ? cell.prize.toLocaleString('zh-CN') : cell.word; caption = cell.prize ? '积分' : 'SHUN'; }
      else if (cell.type === 'bonus') { value = cell.prize ? `中${cell.target}` : cell.word; caption = cell.prize ? '积分' : 'HAO YUN'; }
      else if (cell.type === 'all') { value = cell.word; caption = cell.word === '赢' ? '全中' : '好运常在'; }
      else if (cell.type === 'lucky') caption = '中奖号码';
      else {
        value = cell.factor > 1 || cell.type === 'multiplier' && cell.factor ? cell.factor === 6 ? '666' : `${cell.factor}倍` : cell.type === 'multiplier' ? cell.word : formatNumber(cell.number);
        caption = `${cell.prize.toLocaleString('zh-CN')} 分`;
      }
    }
    tile.classList.toggle('long-value', String(value).length > 6);
    // Hidden contents stay out of the accessibility tree until revealed.
    tile.innerHTML = `<div class="cell-content" aria-hidden="true" style="display:contents"><span class="cell-value">${value}</span><span class="cell-prize">${caption}</span><span class="cell-state"></span></div>`;
    const groupIndex = card.groups.findIndex(group => group.indices.includes(index));
    const sectionIndex = (card.sections || []).findIndex(section => section.indices.includes(index));
    if (sectionIndex >= 0) {
      tile.dataset.cover = card.sections[sectionIndex].cover;
      sectionContainers[sectionIndex].append(tile);
    } else (groupIndex < 0 ? grid : groupContainers[groupIndex]).append(tile);
    if (revealed.has(index)) tile.querySelector('.cell-content').removeAttribute('aria-hidden');
    else addScratchLayer(tile, index);
  });
  updateResult();
  renderAccount();
  renderPage();
}
revealButton.addEventListener('click', () => { if (ensurePaid()) [...revealActions].forEach(reveal => reveal()); });
document.querySelector('#new-card').addEventListener('click', newCard);
document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => {
  if (mode !== button.dataset.game) {
    if (paid && revealed.size < card.cells.length) return;
    mode = button.dataset.game;
    newCard();
  }
  openTicket();
}));
function renderPage() {
  const page = location.hash === '#ticket' ? 'ticket' : location.hash === '#settings' ? 'settings' : 'catalog';
  const changed = document.body.dataset.page !== page;
  document.body.dataset.page = page;
  document.querySelector('#catalog-page').inert = page !== 'catalog';
  document.querySelector('#ticket-page').inert = page !== 'ticket';
  document.querySelector('#settings-page').inert = page !== 'settings';
  document.title = page === 'ticket' ? `${modes[mode].name} · 好运刮刮` : page === 'settings' ? '设置 · 好运刮刮' : '选票 · 好运刮刮';
  if (page === 'settings' && changed) renderSettings();
  if (changed) {
    window.scrollTo(0, 0);
    if (page === 'ticket') document.querySelector('#ticket-page-title').focus({ preventScroll: true });
    else if (page === 'settings') document.querySelector('.settings-navigation h1').focus({ preventScroll: true });
    else document.querySelector('.catalog-heading strong').setAttribute('tabindex', '-1');
  }
}
function openTicket() {
  if (location.hash !== '#ticket') history.pushState({ scratchFromCatalog: true }, '', '#ticket');
  renderPage();
}
document.querySelector('#resume-ticket').addEventListener('click', openTicket);
document.querySelector('#back-to-catalog').addEventListener('click', () => {
  if (history.state?.scratchFromCatalog) history.back();
  else { history.replaceState(null, '', '#catalog'); renderPage(); }
});
window.addEventListener('popstate', renderPage);
window.addEventListener('hashchange', renderPage);
const probabilityNumber = document.querySelector('#probability-number');
const probabilityRange = document.querySelector('#probability-range');
const settingsMessage = document.querySelector('#settings-message');
const formatPercent = rate => Number((rate * 100).toFixed(1)).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
function setProbabilityDraft(percent) {
  probabilityNumber.value = percent;
  probabilityRange.value = percent;
  document.querySelectorAll('[data-probability]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.probability) === Number(percent))));
}
function renderSettings() {
  setProbabilityDraft(Number((configuredWinRate * 100).toFixed(1)));
  document.querySelector('#saved-probability').textContent = `当前已保存：${formatPercent(configuredWinRate)}% · 所有票种统一适用`;
  document.querySelector('#current-ticket-probability').textContent = `当前票券生成概率为 ${formatPercent(card?.winRate ?? ScratchGame.CARD_WIN_RATE)}%，结果保持不变。保存后生成的新票使用新概率。`;
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) { configuredWinRate = ScratchGame.CARD_WIN_RATE; return; }
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Number.isFinite(saved.winRate) || saved.winRate < 0 || saved.winRate > 1) throw new Error('设置数据异常');
    configuredWinRate = saved.winRate;
  } catch {
    configuredWinRate = ScratchGame.CARD_WIN_RATE;
    settingsMessage.textContent = '设置读取失败，暂用默认 10%；请重新保存设置。';
  }
}
probabilityRange.addEventListener('input', () => { setProbabilityDraft(probabilityRange.value); settingsMessage.textContent = '调整完成后点击保存设置。'; });
probabilityNumber.addEventListener('input', () => {
  if (probabilityNumber.validity.valid) {
    probabilityRange.value = probabilityNumber.value;
    document.querySelectorAll('[data-probability]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.probability) === probabilityNumber.valueAsNumber)));
  }
  settingsMessage.textContent = '调整完成后点击保存设置。';
});
document.querySelectorAll('[data-probability]').forEach(button => button.addEventListener('click', () => {
  setProbabilityDraft(button.dataset.probability);
  settingsMessage.textContent = '调整完成后点击保存设置。';
}));
document.querySelector('#reset-probability').addEventListener('click', () => {
  setProbabilityDraft(10);
  settingsMessage.textContent = '已选默认 10%，点击保存设置后生效。';
});
document.querySelector('#probability-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!probabilityNumber.reportValidity()) return;
  const rate = probabilityNumber.valueAsNumber / 100;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, winRate: rate }));
    configuredWinRate = rate;
    renderSettings();
    settingsMessage.textContent = `已保存 ${formatPercent(rate)}%，从下一张新票开始生效。`;
  } catch {
    settingsMessage.textContent = '保存失败，原设置保持不变，请检查本机存储。';
  }
});
document.querySelector('#open-settings').addEventListener('click', () => {
  history.pushState({ scratchFromCatalog: true }, '', '#settings');
  renderPage();
});
document.querySelector('#back-from-settings').addEventListener('click', () => {
  if (history.state?.scratchFromCatalog) history.back();
  else { history.replaceState(null, '', '#catalog'); renderPage(); }
});
function restore(saved) {
  if (saved?.version !== 1 || !Number.isSafeInteger(saved.account?.balance) || saved.account.balance < 0 || !Array.isArray(saved.account.history)
      || !modes[saved.session?.card?.mode] || saved.session.card.cells.length !== ReferenceTickets.expectedCount(saved.session.card.mode) || !Array.isArray(saved.session.card.groups)
      || !Array.isArray(saved.session.revealed) || !saved.session.revealed.every(index => Number.isInteger(index) && index >= 0 && index < saved.session.card.cells.length)
      || !/^[A-Z0-9]{16}$/.test(saved.session.serial) || !Number.isSafeInteger(saved.session.credited) || saved.session.credited < 0) throw new Error('账号数据格式异常');
  account = saved.account;
  revision = saved.revision;
  card = saved.session.card;
  mode = card.mode;
  serial = saved.session.serial;
  paid = saved.session.paid;
  credited = saved.session.credited;
  revealed = new Set(saved.session.revealed);
}
loadSettings();
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { restore(JSON.parse(raw)); renderCard(); }
  else {
    account = { id: ScratchGame.createSerial(), balance: 10000, history: [{ change: 10000, reason: '新账号初始积分', at: new Date().toISOString() }] };
    newCard();
  }
} catch {
  storageReady = false;
  account = { id: 'UNAVAILABLE', balance: 0, history: [] };
  paid = false; credited = 0; revealed = new Set();
  card = ScratchGame.createVariantCard(mode);
  serial = ScratchGame.createSerial();
  renderCard();
  notice('账号数据无法读取，已暂停扣款；请检查浏览器存储设置。');
}
window.addEventListener('storage', event => {
  if (event.key === SETTINGS_KEY) { loadSettings(); if (document.body.dataset.page === 'settings') renderSettings(); return; }
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try { restore(JSON.parse(event.newValue)); renderCard(); notice('已同步其他页面的账号与票券进度。'); }
  catch { storageReady = false; notice('账号数据异常，已暂停刮奖。'); }
});
