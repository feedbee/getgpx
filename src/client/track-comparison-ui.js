import { comparisonActionIcon, shareActionIcon, sharePageLink } from './route-actions-ui.js';
import { bindComparisonOrdering } from './comparison-ordering.js';
import { t, htmlMessage, messageAttribute, escapeHtml } from './i18n.js';
import { formatTrackMetrics, createTrackAuthor } from './my-tracks-ui.js';
import { createComparisonSelection, COMPARISON_MAX_TRACKS, loadComparisonTrack, comparisonUrl, comparisonIdsFromUrl } from './track-comparison.js';
import { routeEndpointLegend } from './route-map-drawing.js';
import { createComparisonMap } from './comparison-map.js';

export function setupTrackComparison({ trackApi, isComparisonPage, documentRef = document, windowRef = window }) {
  let storage;
  try { storage = windowRef.localStorage; } catch { /* Browser denies storage. */ }
  let selection = createComparisonSelection(storage, isComparisonPage ? comparisonIdsFromUrl(windowRef.location?.search) : undefined);
  let trackId;
  let checkedIds = [];
  let mode = 'tracks';
  let generation = 0;
  let entries = [];
  let comparisonMap;
  let fittedTrackId = null;
  let highlightedId = null;
  let ordering;
  const link = documentRef.querySelector('#comparison-link');
  const toggle = documentRef.querySelector('#comparison-toggle');
  let previousCount;
  const bulk = documentRef.querySelector('#bulk-compare-tracks');
  const comparisonIcon = comparisonActionIcon();

  function renderActions() {
    const count = selection.ids.length;
    const selected = selection.ids.includes(trackId);
    link.hidden = false;
    link.innerHTML = `${comparisonIcon}${count ? `<span>${htmlMessage('comparison.navigation')}</span><span class="comparison-count">${count}</span>` : ''}`;
    link.setAttribute('aria-label', count ? t('comparison.count', { count }) : t('comparison.navigation'));
    toggle.disabled = !trackId || (!selected && !selection.canAdd([trackId]));
    toggle.title = toggle.disabled && trackId ? t('comparison.limit', { max: COMPARISON_MAX_TRACKS }) : '';
    if (bulk) {
      bulk.disabled = !selection.canAdd(checkedIds) || !checkedIds.some(id => !selection.ids.includes(id));
      bulk.querySelector('span').textContent = t('comparison.bulkSelect');
      bulk.title = checkedIds.length && !selection.canAdd(checkedIds) ? t('comparison.limit', { max: COMPARISON_MAX_TRACKS }) : '';
    }
    toggle.innerHTML = `${comparisonIcon}<span>${htmlMessage('comparison.action')}</span>`;
    toggle.classList.toggle('is-selected', selected);
    toggle.setAttribute('aria-pressed', String(selected));
    toggle.setAttribute('aria-label', t(selected ? 'comparison.remove' : 'comparison.select'));
    link.href = comparisonUrl(selection.ids);
    if (previousCount !== undefined && count !== previousCount
      && !windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const badge = link.querySelector('.comparison-count');
      badge?.animate?.([
        { transform: 'scale(.8)', opacity: .5 },
        { transform: 'scale(1.3)', opacity: 1, offset: .45 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 420, easing: 'ease-out' });
      if (previousCount === 0 || count === 0) link.animate?.([
        { opacity: .4, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 320, easing: 'ease-out' });
    }
    previousCount = count;
  }
  function notifySelection(changed) {
    if (!changed || !selection.persisted) {
      const toast = documentRef.querySelector('#toast');
      toast.textContent = t(changed ? 'comparison.storageUnavailable' : 'comparison.limit', { max: COMPARISON_MAX_TRACKS });
      toast.classList.add('visible');
      windowRef.setTimeout(() => toast.classList.remove('visible'), 2500);
    }
    renderActions();
  }
  function toggleCurrentTrack() { notifySelection(selection.toggle(trackId)); }
  toggle.addEventListener('click', toggleCurrentTrack);
  if (isComparisonPage) link.addEventListener('click', event => event.preventDefault());
  bulk?.addEventListener('click', () => {
    if (bulk.disabled) return;
    notifySelection(selection.add(checkedIds));
  });
  windowRef.addEventListener('storage', event => {
    if (isComparisonPage || (event.key && event.key !== 'getgpx.comparison.v1')) return;
    selection = createComparisonSelection(storage);
    renderActions();
  });

  function highlight(id) {
    if (!entries.some(entry => entry.id === id && !entry.hidden)) id = null;
    highlightedId = id;
    documentRef.querySelectorAll('[data-comparison-id]').forEach(row => row.classList.toggle('is-highlighted', row.dataset.comparisonId === id));
    comparisonMap.highlight(id);
  }

  function renderRows() {
    if (ordering?.dragging) return;
    const list = documentRef.querySelector('#comparison-list');
    const focused = documentRef.activeElement;
    const focusedRow = focused?.closest?.('[data-comparison-id]');
    const focusedId = focusedRow?.dataset.comparisonId;
    const focusAction = focused === focusedRow ? null : ['data-comparison-drag', 'data-fit-track', 'data-remove', 'data-visibility', 'data-retry']
      .find(attribute => focused?.hasAttribute?.(attribute));
    const focusedLink = focused?.tagName === 'A';
    const focusedIndex = [...list.querySelectorAll('[data-comparison-id]')].indexOf(focusedRow);
    list.replaceChildren();
    entries.forEach(entry => {
      const row = documentRef.createElement('article');
      row.className = 'comparison-row track-card';
      row.dataset.comparisonId = entry.id;
      row.classList.toggle('is-hidden', Boolean(entry.hidden));
      row.style.setProperty('--track-color', entry.color);
      row.tabIndex = 0;
      const title = entry.metadata?.title || entry.id;
      row.innerHTML = `<button class="comparison-drag-handle" type="button" data-comparison-drag aria-keyshortcuts="ArrowUp ArrowDown Home End"><span class="comparison-number" aria-hidden="true">${entry.number}</span><svg viewBox="0 0 20 12" aria-hidden="true"><path d="M6 2h0m8 0h0M6 6h0m8 0h0M6 10h0m8 0h0"/></svg></button><div class="track-card-body"><div class="comparison-track-heading"><button class="track-card-title comparison-fit-track" type="button" data-fit-track ${entry.state === 'ready' && !entry.hidden ? '' : 'disabled'}>${escapeHtml(title)}</button><a class="comparison-track-link" target="_blank" rel="noopener noreferrer" href="/tracks/${encodeURIComponent(entry.id)}"><svg class="comparison-external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/></svg></a><span class="loading-spinner comparison-loading${entry.state === 'loading' ? ' is-loading' : ''}" role="status" aria-hidden="${entry.state !== 'loading'}" ${messageAttribute('aria-label', 'common.loadingRoute')}></span></div><p class="track-card-metrics"></p><p class="comparison-state" role="status"></p><div class="comparison-row-footer"><span class="comparison-author"></span><div class="comparison-row-actions"><button type="button" data-remove><span aria-hidden="true">×</span> ${htmlMessage('comparison.remove')}</button><button type="button" data-visibility aria-pressed="${Boolean(entry.hidden)}"><svg class="comparison-visibility-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${entry.hidden ? '' : '<path class="comparison-eye-slash" d="m3 3 18 18"/>'}</svg>${htmlMessage(entry.hidden ? 'comparison.show' : 'comparison.hide')}</button><button type="button" data-retry ${entry.state === 'error' ? '' : 'hidden'}>${htmlMessage('comparison.retry')}</button></div></div></div>`;
      row.querySelector('[data-comparison-drag]').setAttribute('aria-label', t('comparison.reorder', { title }));
      row.querySelector('[data-comparison-drag]').title = t('comparison.reorderHint');
      row.querySelector('a').setAttribute('aria-label', t('comparison.openTrack', { title }));
      row.querySelector('a').title = t('comparison.openTrack', { title });
      const fitButton = row.querySelector('[data-fit-track]');
      fitButton.setAttribute('aria-label', t('comparison.showOnMap', { title }));
      fitButton.title = t('comparison.showOnMap', { title });
      function fitTrack() {
        if (!entry.hidden && entry.state === 'ready' && comparisonMap.fitTrack(entry.id)) {
          fittedTrackId = entry.id;
          highlight(entry.id);
        }
      }
      fitButton.addEventListener('click', fitTrack);
      row.addEventListener('click', event => {
        if (!event.target.closest('a, button') && !ordering?.dragging) fitTrack();
      });
      row.addEventListener('keydown', event => {
        if (event.target === row && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          fitTrack();
        }
      });
      if (entry.metadata?.author?.displayName) {
        row.querySelector('.comparison-author').append(createTrackAuthor(entry.metadata.author, documentRef));
      }
      row.querySelector('.track-card-metrics').textContent = entry.metadata ? formatTrackMetrics(entry.metadata) : '';
      row.querySelector('.comparison-state').textContent = entry.state === 'error' ? t('comparison.unavailable') : '';
      row.addEventListener('mouseenter', () => highlight(entry.id));
      row.addEventListener('mouseleave', () => highlight(null));
      row.addEventListener('focusin', () => highlight(entry.id));
      row.addEventListener('focusout', event => { if (!row.contains(event.relatedTarget)) highlight(null); });
      row.querySelector('[data-remove]').addEventListener('click', () => { selection.toggle(entry.id); updateUrl(); renderActions(); load(); });
      row.querySelector('[data-visibility]').addEventListener('click', () => {
        entry.hidden = !entry.hidden;
        renderRows();
        drawMap();
      });
      row.querySelector('[data-retry]').addEventListener('click', load);
      list.append(row);
    });
    if (focusedId) {
      const rows = [...list.querySelectorAll('[data-comparison-id]')];
      const replacement = rows.find(row => row.dataset.comparisonId === focusedId)
        ?? rows[Math.min(Math.max(focusedIndex, 0), rows.length - 1)];
      const target = focusAction ? replacement?.querySelector(`[${focusAction}]`) : focusedLink ? replacement?.querySelector('a') : replacement;
      (target && !target.hidden && !target.disabled ? target : replacement ?? link).focus({ preventScroll: true });
      highlight(replacement?.dataset.comparisonId ?? null);
    }
    documentRef.querySelector('#comparison-empty').hidden = entries.length > 0;
  }

  function reorderTracks(ids, movedId) {
    if (!selection.reorder(ids)) return;
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    entries = ids.map(id => {
      const entry = byId.get(id);
      entry.number = selection.identity(id).number;
      documentRef.querySelector(`[data-comparison-id="${id}"] .comparison-number`).textContent = entry.number;
      return entry;
    });
    comparisonMap.reorder(ids);
    highlight(movedId);
    updateUrl();
    notifySelection(true);
    const entry = byId.get(movedId);
    documentRef.querySelector('#comparison-order-status').textContent = t('comparison.moved', {
      title: entry.metadata?.title || movedId, position: ids.indexOf(movedId) + 1, count: ids.length,
    });
  }

  function updateUrl() {
    windowRef.history.replaceState(null, '', comparisonUrl(selection.ids));
  }
  function visibleEntries() { return entries.filter(entry => entry.state === 'ready' && !entry.hidden); }
  function drawMap(options) {
    const desiredHighlight = highlightedId;
    comparisonMap.draw(visibleEntries(), mode, options);
    highlight(desiredHighlight);
  }

  async function load() {
    const run = ++generation;
    const previous = entries;
    entries = selection.ids.map(id => ({ ...previous.find(entry => entry.id === id), id,
      ...selection.identity(id), state: previous.find(entry => entry.id === id)?.state === 'ready' ? 'ready' : 'loading' }));
    if (!entries.some(entry => entry.id === fittedTrackId)) fittedTrackId = null;
    renderRows();
    drawMap({ fit: fittedTrackId === null });
    await Promise.all(entries.map(async entry => {
      if (entry.state === 'ready') return;
      try { Object.assign(entry, await loadComparisonTrack(trackApi, entry.id, metadata => {
        if (run === generation) { entry.metadata = metadata; renderRows(); }
      }), { state: 'ready' }); }
      catch { entry.state = 'error'; }
      if (run !== generation) return;
      renderRows();
      drawMap({ fit: fittedTrackId === null });
    }));
  }

  if (isComparisonPage) {
    const page = documentRef.createElement('main');
    page.className = 'comparison-page';
    page.innerHTML = `<header class="comparison-header"><div><h1>${htmlMessage('comparison.title')}</h1><p>${htmlMessage('comparison.description')}</p></div><button class="bulk-compare-tracks" id="share-comparison" type="button">${shareActionIcon()}${htmlMessage('route.share')}</button></header><div class="comparison-workspace"><section class="comparison-sidebar" ${messageAttribute('aria-label', 'comparison.tracks')}><p id="comparison-empty">${htmlMessage('comparison.empty')}</p><p class="comparison-order-hint">${htmlMessage('comparison.orderHint')}</p><div id="comparison-list"></div><p class="comparison-order-status" id="comparison-order-status" role="status"></p></section><section class="comparison-map-shell" ${messageAttribute('aria-label', 'map.route')}><div class="comparison-toolbar segmented-control">${['tracks', 'gradient', 'elevation', 'surface', 'waytype', 'quality'].map(value => `<button type="button" data-comparison-mode="${value}" aria-pressed="${value === mode}" class="${value === mode ? 'active' : ''}">${htmlMessage(value === 'tracks' ? 'comparison.colors' : value === 'waytype' ? 'common.roadType' : `common.${value}`)}</button>`).join('')}</div><div id="comparison-map"></div><div class="map-note comparison-map-note">${routeEndpointLegend()}</div><div class="hover-readout" id="comparison-readout" hidden></div></section></div>`;
    documentRef.querySelector('.topbar').after(page);
    comparisonMap = createComparisonMap(page.querySelector('#comparison-map'), page.querySelector('#comparison-readout'), highlight);
    page.querySelectorAll('[data-comparison-mode]').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.comparisonMode;
      page.querySelectorAll('[data-comparison-mode]').forEach(control => { control.classList.toggle('active', control === button); control.setAttribute('aria-pressed', String(control === button)); });
      drawMap();
    }));
    ordering = bindComparisonOrdering({ list: page.querySelector('#comparison-list'), onReorder: reorderTracks, windowRef,
      onFinish: id => {
        renderRows();
        page.querySelector(`[data-comparison-id="${id}"] [data-comparison-drag]`)?.focus({ preventScroll: true });
      } });
    page.querySelector('#share-comparison').addEventListener('click', event => sharePageLink({
      button: event.currentTarget, path: comparisonUrl(selection.ids), documentRef, windowRef,
    }));
    windowRef.addEventListener('popstate', () => {
      selection = createComparisonSelection(storage, comparisonIdsFromUrl(windowRef.location.search));
      renderActions();
      load();
    });
    windowRef.addEventListener('resize', () => comparisonMap.invalidateSize());
    load();
  }
  renderActions();
  return {
    setTrack(id) { trackId = id; renderActions(); },
    setCheckedTracks(tracks) { checkedIds = tracks.map(track => track.id); renderActions(); },
  };
}
