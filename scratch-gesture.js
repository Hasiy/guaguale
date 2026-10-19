(function (root) {
  'use strict';
  // Clip a whole movement segment, so fast moves also scratch cells between events.
  function intersects(from, to, rect, padding = 0) {
    const dx = to.x - from.x, dy = to.y - from.y;
    let near = 0, far = 1;
    for (const [direction, distance] of [
      [-dx, from.x - rect.left + padding], [dx, rect.right - from.x + padding],
      [-dy, from.y - rect.top + padding], [dy, rect.bottom - from.y + padding],
    ]) {
      if (direction === 0) { if (distance < 0) return false; }
      else {
        const ratio = distance / direction;
        if (direction < 0) near = Math.max(near, ratio);
        else far = Math.min(far, ratio);
        if (near > far) return false;
      }
    }
    return true;
  }

  function attach(surface, { getLayers, canStart }) {
    let pointer = null, previous = null;
    const touched = new Set();
    function trace(event) {
      const point = { x: event.clientX, y: event.clientY };
      const from = previous || point;
      for (const layer of getLayers()) {
        const rect = layer.getRect();
        // Same brush radius as the 300px logical canvas used by the coating renderer.
        if (rect.width > 0 && rect.height > 0 && intersects(from, point, rect, rect.width * 29 / 300)) {
          touched.add(layer);
          layer.scratch(from, point, rect, event.timeStamp);
        }
      }
      previous = point;
    }
    function cancel(checkCoverage = true) {
      const previousPointer = pointer;
      pointer = null;
      previous = null;
      if (previousPointer !== null && surface.hasPointerCapture(previousPointer)) {
        surface.releasePointerCapture(previousPointer);
      }
      if (checkCoverage) for (const layer of touched) layer.checkCoverage();
      touched.clear();
    }
    surface.addEventListener('pointerdown', event => {
      if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      // Blank space and revealed cells belong to native page scrolling.
      // A stroke starting on foil can still travel across all neighboring cells.
      if (!event.target.closest?.('canvas') || !event.target.closest('.scratch-cell') || !canStart()) return;
      event.preventDefault();
      pointer = event.pointerId;
      previous = null;
      // Capture on the persistent grid, rather than a canvas that may be removed on reveal.
      surface.setPointerCapture(pointer);
      trace(event);
    });
    surface.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      event.preventDefault();
      const events = event.getCoalescedEvents?.() || [];
      for (const sample of events) trace(sample);
      trace(event);
    });
    surface.addEventListener('pointerup', event => {
      if (event.pointerId !== pointer) return;
      trace(event);
      cancel();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) {
      surface.addEventListener(name, event => { if (event.pointerId === pointer) cancel(); });
    }
    return { cancel };
  }
  const api = { intersects, attach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScratchGesture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
