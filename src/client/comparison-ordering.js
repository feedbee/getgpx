// Pointer sorting works with mouse, pen and touch; the handle also accepts arrow keys.
export function bindComparisonOrdering({ list, onReorder, onFinish = () => {}, windowRef = window, documentRef = list.ownerDocument }) {
  let drag = null;
  let settling = false;
  let frame;
  const animations = new WeakMap();
  const rows = () => [...list.querySelectorAll('[data-comparison-id]')];
  const order = () => rows().map(row => row.dataset.comparisonId);
  const reducedMotion = () => windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  function layoutRect(row) {
    const rect = row.getBoundingClientRect();
    return { left: rect.left, width: rect.width, top: row.offsetParent === list ? list.getBoundingClientRect().top + row.offsetTop : rect.top, height: rect.height };
  }

  function animateRows(before) {
    rows().forEach(row => {
      animations.get(row)?.cancel();
      if (row === drag?.row || reducedMotion()) return;
      const delta = before.get(row) - layoutRect(row).top;
      if (delta) animations.set(row, row.animate?.([
        { transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' },
      ], { duration: 180, easing: 'ease-out' }));
    });
  }

  function moveRow(row, beforeRow) {
    const current = rows();
    const next = current.filter(item => item !== row);
    next.splice(beforeRow ? next.indexOf(beforeRow) : next.length, 0, row);
    if (next.every((item, index) => item === current[index])) return;
    const before = new Map(current.map(item => [item, item.getBoundingClientRect().top]));
    current.forEach(item => animations.get(item)?.cancel());
    list.insertBefore(row, beforeRow ?? null);
    onReorder(next.map(item => item.dataset.comparisonId), row.dataset.comparisonId);
    if (drag) drag.preview.querySelector('.comparison-number').textContent = drag.row.querySelector('.comparison-number').textContent;
    animateRows(before);
  }

  function moveAtPointer() {
    if (!drag) return;
    drag.preview.style.transform = `translate3d(${drag.x - drag.startX}px, ${drag.y - drag.startY}px, 0)`;
    const centerY = drag.top + drag.height / 2 + drag.y - drag.startY;
    const before = rows().filter(row => row !== drag.row).find(row => {
      const rect = layoutRect(row);
      return centerY < rect.top + rect.height / 2;
    });
    moveRow(drag.row, before);
  }

  function scrollWhileDragging() {
    if (!drag) return;
    const container = list.parentElement;
    const bounds = container.getBoundingClientRect();
    if (drag.x >= bounds.left && drag.x <= bounds.right) {
      const delta = drag.y < bounds.top + 32 ? -12 : drag.y > bounds.bottom - 32 ? 12 : 0;
      if (delta) { container.scrollTop += delta; moveAtPointer(); }
    }
    frame = windowRef.requestAnimationFrame(scrollWhileDragging);
  }

  function finish(cancelled = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    settling = true;
    windowRef.cancelAnimationFrame(frame);
    if (list.hasPointerCapture(previous.pointerId)) list.releasePointerCapture(previous.pointerId);
    if (cancelled) {
      const before = new Map(rows().map(row => [row, row.getBoundingClientRect().top]));
      previous.order.forEach(id => list.append(rows().find(row => row.dataset.comparisonId === id)));
      onReorder(previous.order, previous.row.dataset.comparisonId);
      previous.preview.querySelector('.comparison-number').textContent = previous.row.querySelector('.comparison-number').textContent;
      animateRows(before);
    }
    const rect = layoutRect(previous.row);
    const animation = reducedMotion() ? null : previous.preview.animate?.([
      { transform: previous.preview.style.transform || 'translate3d(0, 0, 0)' },
      { transform: `translate3d(${rect.left - previous.left}px, ${rect.top - previous.top}px, 0)` },
    ], { duration: 180, easing: 'ease-out', fill: 'forwards' });
    function complete() {
      previous.preview.remove();
      previous.row.classList.remove('is-dragging');
      list.classList.remove('is-reordering');
      settling = false;
      previous.handle.focus({ preventScroll: true });
      onFinish(previous.row.dataset.comparisonId);
    }
    if (animation) animation.finished.then(complete, complete);
    else complete();
  }

  list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-comparison-drag]');
    if (!handle || (event.button !== undefined && event.button !== 0) || drag || settling) return;
    event.preventDefault();
    const row = handle.closest('[data-comparison-id]');
    const rect = row.getBoundingClientRect();
    const preview = row.cloneNode(true);
    preview.removeAttribute('data-comparison-id');
    preview.classList.add('comparison-drag-preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;
    Object.assign(preview.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    documentRef.body.append(preview);
    drag = { row, handle, preview, left: rect.left, top: rect.top, height: rect.height, pointerId: event.pointerId, order: order(),
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
    handle.focus({ preventScroll: true });
    row.classList.add('is-dragging');
    list.classList.add('is-reordering');
    list.setPointerCapture(event.pointerId);
    frame = windowRef.requestAnimationFrame(scrollWhileDragging);
  });
  list.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    moveAtPointer();
  });
  list.addEventListener('pointerup', event => {
    if (drag?.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    moveAtPointer();
    finish();
  });
  list.addEventListener('pointercancel', event => { if (drag?.pointerId === event.pointerId) finish(true); });
  list.addEventListener('lostpointercapture', () => finish(true));
  windowRef.addEventListener('blur', () => finish(true));
  list.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-comparison-drag]');
    if (!handle) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
    if (drag || settling || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const row = handle.closest('[data-comparison-id]');
    const items = rows();
    const index = items.indexOf(row);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
    if (target !== index) moveRow(row, target < index ? items[target] : items[target + 1]);
    handle.focus({ preventScroll: true });
  });
  return { get dragging() { return drag !== null || settling; } };
}
