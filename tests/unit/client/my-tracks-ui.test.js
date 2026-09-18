import { describe, expect, it } from 'vitest';
import { formatTrackDuration, previewPolyline, trackStatusLabel } from '../../../src/client/my-tracks-ui.js';

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
});
