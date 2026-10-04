import { poiName } from './analysis-presentation.js';
import { t, htmlMessage, escapeHtml } from './i18n.js';
import { routePointReadout } from './active-route-point.js';

const mapsIcon = '<svg class="point-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#34a853" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/><path fill="#4285f4" d="M5 9a7 7 0 0 1 7-7v7l-5 5c-1-2-2-3-2-5Z"/><path fill="#fbbc04" d="m12 9 7-1c1 4-4 10-7 14l-3-4Z"/><circle cx="12" cy="9" r="3" fill="#fff"/><path fill="#ea4335" d="M12 2a7 7 0 0 1 7 6l-4 1a3 3 0 0 0-3-3Z"/></svg>';
const externalIcon = '<svg class="point-external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/></svg>';
const copyIcon = '<svg class="point-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/></svg>';

export function coordinatePair(point) {
  return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
}

export function pointPopoverPosition(anchor, size, bounds) {
  const above = anchor.y - size.height - 12;
  const top = above >= bounds.top ? above : (anchor.bottom ?? anchor.y) + 12;
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

export function routePointHeading(context, track) {
  const poi = track.pointsOfInterest?.[context.poiIndex];
  if (poi) return `<div class="point-heading"><span class="poi-marker" aria-hidden="true"><span>${context.poiIndex + 1}</span></span><strong>${escapeHtml(poiName(poi, context.poiIndex))}</strong></div>`;
  if (!['start', 'finish'].includes(context.kind)) return '';
  const start = context.kind === 'start';
  return `<div class="point-heading"><span class="endpoint endpoint-${context.kind}" aria-hidden="true">${start ? 'A' : 'B'}</span><strong>${htmlMessage(start ? 'map.start' : 'map.finish')}</strong></div>`;
}

export function createRoutePointPopover({ getTrack, onSelect, onClose = () => {}, documentRef = document, windowRef = window,
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
    const previous = selection;
    const trigger = selection?.trigger;
    const focusTarget = selection?.focusTarget ?? trigger;
    selection = null;
    panel.hidden = true;
    if (previous) onClose();
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) focusTarget?.focus?.({ preventScroll: true });
  }

  function open(index, { anchor, trigger, focusTarget, bounds, context = {} } = {}) {
    if (selection?.index === index && selection.trigger === trigger) {
      close({ restoreFocus: true });
      return;
    }
    close();
    const track = getTrack();
    const point = track?.points[index];
    if (!point) return;
    onSelect(index, context);
    const coordinates = coordinatePair(track.pointsOfInterest?.[context.poiIndex] ?? point);
    selection = { index, trigger, focusTarget, scrollX: windowRef.scrollX, scrollY: windowRef.scrollY };
    const opened = selection;
    panel.innerHTML = `<div class="point-popover-content">${routePointHeading(context, track)}<div class="point-readout">${routePointReadout(point, track)}</div><span class="point-coordinates"></span><div class="point-actions"><a target="_blank" rel="noopener noreferrer">${mapsIcon}<span>${htmlMessage('point.googleMaps')}</span>${externalIcon}</a><button type="button">${copyIcon}<span>${htmlMessage('point.copy')}</span></button></div><span class="point-copy-status" role="status"></span></div>`;
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
      left: Math.max(viewport.left, bounds.left + 8), top: viewport.top,
      right: Math.min(viewport.right, bounds.right - 8), bottom: viewport.bottom,
    } : viewport;
    panel.style.maxWidth = `${Math.max(0, limits.right - limits.left)}px`;
    panel.style.maxHeight = `${Math.max(0, limits.bottom - limits.top)}px`;
    panel.style.setProperty('--point-max-height', panel.style.maxHeight);
    panel.hidden = false;
    const rect = trigger?.getBoundingClientRect();
    const pointAnchor = anchor ?? (context.kind || Number.isInteger(context.poiIndex) ? { x: rect.left + rect.width / 2, y: rect.top, bottom: rect.bottom } : null) ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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
