import { describe, expect, it, vi } from 'vitest';
import { cancelTrackSearch, formatTrackDuration, previewPolyline, trackStatusLabel } from '../../../src/client/my-tracks-ui.js';

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

  it('clears an active search, restores the collection URL, and reloads tracks', () => {
    const input = { value: 'вечерний гравий' };
    const history = { replaceState: vi.fn() };
    const reload = vi.fn();

    cancelTrackSearch({ input, history, reload });

    expect(input.value).toBe('');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/my-tracks');
    expect(reload).toHaveBeenCalledWith({ reset: true });
  });
});
