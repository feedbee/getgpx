import { t, htmlMessage } from './i18n.js';
import { routePointReadout } from './active-route-point.js';

export function coordinatePair(point) {
  return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
}

export function pointPopoverPosition(anchor, size, bounds) {
  const above = anchor.y - size.height - 12;
  const top = above >= bounds.top ? above : anchor.y + 12;
  return {
    left: Math.max(bounds.left, Math.min(anchor.x - size.width / 2, bounds.right - size.width)),
    top: Math.max(bounds.top, Math.min(top, bounds.bottom - size.height)),
  };
}

export function pointPopoverArrow(anchor, size, position) {
  return {
    left: Math.max(16, Math.min(anchor.x - position.left, size.width - 16)),
    side: position.top + size.height <= anchor.y ? 'bottom' : 'top',
  };
}

export function createRoutePointPopover({ getTrack, onSelect, documentRef = document, windowRef = window,
  clipboard = windowRef.navigator.clipboard }) {
  const panel = documentRef.createElement('div');
  panel.className = 'route-point-popover';
  panel.hidden = true;
  panel.id = 'route-point-popover';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('point.details'));
  documentRef.body.append(panel);
  let selection = null;

  function close({ restoreFocus = false } = {}) {
    const trigger = selection?.trigger;
    const focusTarget = selection?.focusTarget ?? trigger;
    selection = null;
    panel.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) focusTarget?.focus?.({ preventScroll: true });
  }

  function open(index, { anchor, trigger, focusTarget, bounds } = {}) {
    if (selection?.index === index && selection.trigger === trigger) {
      close({ restoreFocus: true });
      return;
    }
    close();
    const track = getTrack();
    const point = track?.points[index];
    if (!point) return;
    onSelect(index);
    const coordinates = coordinatePair(point);
    selection = { index, trigger, focusTarget, scrollX: windowRef.scrollX, scrollY: windowRef.scrollY };
    const opened = selection;
    panel.innerHTML = `<div class="point-popover-content"><div class="point-readout">${routePointReadout(point, track)}</div><span class="point-coordinates"></span><div class="point-actions"><a target="_blank" rel="noopener noreferrer">${htmlMessage('point.googleMaps')}</a><button type="button">${htmlMessage('point.copy')}</button></div><span class="point-copy-status" role="status"></span></div>`;
    panel.querySelector('.point-coordinates').textContent = coordinates;
    panel.querySelector('a').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
    panel.querySelector('button').addEventListener('click', async () => {
      try {
        await clipboard.writeText(coordinates);
        if (selection === opened) panel.querySelector('.point-copy-status').textContent = t('point.copied');
      } catch {
        if (selection === opened) panel.querySelector('.point-copy-status').textContent = t('point.copyFailed');
      }
    });
    trigger?.setAttribute('aria-expanded', 'true');
    trigger?.setAttribute('aria-controls', panel.id);
    const viewport = { left: 8, top: 8, right: windowRef.innerWidth - 8, bottom: windowRef.innerHeight - 8 };
    const limits = bounds ? {
      left: Math.max(viewport.left, bounds.left + 8), top: Math.max(viewport.top, bounds.top + 8),
      right: Math.min(viewport.right, bounds.right - 8), bottom: Math.min(viewport.bottom, bounds.bottom - 8),
    } : viewport;
    panel.style.maxWidth = `${Math.max(0, limits.right - limits.left)}px`;
    panel.style.maxHeight = `${Math.max(0, limits.bottom - limits.top)}px`;
    panel.style.setProperty('--point-max-height', panel.style.maxHeight);
    panel.hidden = false;
    const rect = trigger?.getBoundingClientRect();
    const pointAnchor = anchor ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const size = panel.getBoundingClientRect();
    const position = pointPopoverPosition(pointAnchor, size, limits);
    const arrow = pointPopoverArrow(pointAnchor, size, position);
    panel.setAttribute('data-arrow-side', arrow.side);
    panel.style.setProperty('--point-arrow-left', `${arrow.left}px`);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.querySelector('button').focus({ preventScroll: true });
  }

  documentRef.addEventListener('pointerdown', (event) => {
    if (selection && !panel.contains(event.target) && !selection.trigger?.contains(event.target)) close();
  });
  documentRef.addEventListener('keydown', (event) => {
    if (selection && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
    }
  });
  windowRef.addEventListener('resize', () => close());
  windowRef.addEventListener('scroll', (event) => {
    if (!selection || panel.contains(event.target)) return;
    if (event.target !== documentRef || windowRef.scrollX !== selection.scrollX || windowRef.scrollY !== selection.scrollY) close();
  }, true);
  return { open, close, get isOpen() { return selection !== null; } };
}
