import { describe, expect, it, vi } from 'vitest';
import { bulkDeleteSummary, bulkSelectionState, cancelTrackSearch, formatTrackDuration, formatTrackMetrics, previewPolyline, trackStatusLabel } from '../../../src/client/my-tracks-ui.js';

describe('my tracks UI', () => {
  it('formats processing and terminal statuses in friendly Russian', () => {
    expect(trackStatusLabel({ status: 'PROCESSING', step: 'ENRICHING' })).toBe('Анализируем покрытия');
    expect(trackStatusLabel({ status: 'FAILED' })).toBe('Нужен повторный анализ');
    expect(trackStatusLabel({ status: 'READY' })).toBe('Готов');
  });

  it('formats durations and normalized preview geometry', () => {
    expect(formatTrackDuration(5_430_000)).toBe('1:31');
    expect(previewPolyline({ points: [[0, 12.345], [100, 99]] })).toBe('0.00,12.35 100.00,99.00');
    expect(previewPolyline(null)).toBe('');
  });

  it('formats card metrics in the same order as the track page', () => {
    expect(formatTrackMetrics({
      distanceKm: 42.36,
      ascentM: 812,
      descentM: 790,
      estimatedDurationMs: 7_200_000,
      speedKmh: 21.2,
    })).toBe('42,4 км · ↗ 812 м · ↘ 790 м · 2:00 · 21,2 км/ч');
  });

  it('clears an active search, restores the collection URL, and reloads tracks', () => {
    const input = { value: 'вечерний гравий' };
    const history = { replaceState: vi.fn() };
    const reload = vi.fn();

    cancelTrackSearch({ input, history, reload });

    expect(input.value).toBe('');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/my-tracks');
    expect(reload).toHaveBeenCalledWith({ reset: true });
  });

  it('summarizes the first ten selected tracks and the remaining count', () => {
    const tracks = Array.from({ length: 13 }, (_, index) => ({ id: `track-${index + 1}`, title: `Трек ${index + 1}` }));

    expect(bulkDeleteSummary(tracks)).toEqual({
      count: 13,
      titles: tracks.slice(0, 10).map((track) => track.title),
      remaining: 3,
    });
  });

  it('switches the bulk action between selecting and clearing all loaded tracks', () => {
    expect(bulkSelectionState({ total: 3, selected: 0 })).toEqual({
      allSelected: false, selectLabel: 'Выбрать всё', deleteLabel: 'Удалить', deleteDisabled: true,
    });
    expect(bulkSelectionState({ total: 3, selected: 3 })).toEqual({
      allSelected: true, selectLabel: 'Отменить выбор', deleteLabel: 'Удалить (3)', deleteDisabled: false,
    });
  });
});
