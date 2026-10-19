const { test } = require('node:test');
const assert = require('node:assert/strict');
const { intersects, attach } = require('./scratch-gesture.js');

function fixture(onCoating = true) {
  const handlers = new Map();
  let captured = null, starts = 0;
  const surface = {
    addEventListener: (name, callback) => handlers.set(name, callback),
    setPointerCapture: id => { captured = id; },
    hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; },
  };
  const layers = [0, 1, 2].map(column => ({
    strokes: [], checks: 0,
    getRect: () => ({ left: column * 110, right: column * 110 + 100, top: 0, bottom: 100, width: 100, height: 100 }),
    scratch(from, to) { this.strokes.push({ from, to }); },
    checkCoverage() { this.checks++; },
  }));
  const gesture = attach(surface, { getLayers: () => [...layers], canStart: () => { starts++; return true; } });
  const emit = (name, x, y, id = 1) => handlers.get(name)({
    clientX: x, clientY: y, pointerId: id, pointerType: 'touch', timeStamp: 200,
    target: { closest: selector => selector === 'canvas' && !onCoating ? null : ({}) }, preventDefault() {},
  });
  return { layers, emit, gesture, starts: () => starts, captured: () => captured };
}

test('快速横滑覆盖两个事件之间的所有格子，包括格间空隙', () => {
  const f = fixture();
  f.emit('pointerdown', 30, 50);
  f.emit('pointermove', 280, 50);
  f.emit('pointerup', 280, 50);
  assert.ok(f.layers.every(layer => layer.strokes.length > 0));
  assert.ok(f.layers.every(layer => layer.checks === 1));
  assert.equal(f.starts(), 1);
  assert.equal(f.captured(), null);
});

test('从空白或已揭晓区域滑动时，不捕获指针、不扣款、不刮奖', () => {
  const f = fixture(false);
  f.emit('pointerdown', 30, 50);
  f.emit('pointermove', 280, 50);
  f.emit('pointerup', 280, 50);
  assert.equal(f.captured(), null);
  assert.equal(f.starts(), 0);
  assert.ok(f.layers.every(layer => layer.strokes.length === 0 && layer.checks === 0));
});

test('起始格揭晓移除后，同一次手势仍能刮到其他格子', () => {
  const f = fixture();
  f.layers[0].scratch = () => f.layers.shift();
  f.emit('pointerdown', 30, 50);
  assert.equal(f.layers.length, 2);
  assert.equal(f.captured(), 1);
  f.emit('pointermove', 280, 50);
  f.emit('pointerup', 280, 50);
  assert.ok(f.layers.every(layer => layer.strokes.length > 0));
  assert.equal(f.starts(), 1);
});

test('第二根手指不会接管正在进行的刮奖手势', () => {
  const f = fixture();
  f.emit('pointerdown', 30, 50);
  f.emit('pointerdown', 280, 50, 2);
  f.emit('pointermove', 280, 50, 2);
  f.emit('pointerup', 280, 50, 2);
  assert.equal(f.layers[2].strokes.length, 0);
  assert.equal(f.starts(), 1);
  assert.equal(f.captured(), 1);
});

test('取消或换票清理后，不会把旧轨迹连接到新的手势', () => {
  const f = fixture();
  f.emit('pointerdown', 30, 50);
  f.gesture.cancel(false);
  assert.equal(f.layers[0].checks, 0);
  f.emit('pointerdown', 280, 50);
  assert.equal(f.layers[1].strokes.length, 0);
  f.emit('pointercancel', 280, 50);
  assert.equal(f.captured(), null);
  assert.equal(f.layers[2].checks, 1);
});

test('斜线命中真实穿过的格子，不擦除仅与外接矩形相交的格子', () => {
  const rect = { left: 40, right: 60, top: 0, bottom: 20 };
  assert.equal(intersects({ x: 0, y: 0 }, { x: 100, y: 100 }, rect), false);
  assert.equal(intersects({ x: 0, y: 10 }, { x: 100, y: 10 }, rect), true);
  assert.equal(intersects({ x: 50, y: -20 }, { x: 50, y: 40 }, rect), true);
  assert.equal(intersects({ x: 20, y: 10 }, { x: 20, y: 10 }, rect), false);
  assert.equal(intersects({ x: 35, y: 10 }, { x: 35, y: 10 }, rect, 6), true);
});
