import { describe, expect, it } from 'vitest';
import { formatTrackAttribution } from '../../../src/client/track-meta-ui.js';

describe('track upload attribution', () => {
  it('formats uploader and upload date for the route header', () => {
    expect(formatTrackAttribution({
      createdAt: '2026-09-17T10:00:00.000Z',
      uploader: { displayName: 'Jan Kowalski' },
    }, 'ru-RU', 'UTC')).toBe('Загрузил Jan Kowalski · 17 сентября 2026 г.');
  });

  it('falls back to a neutral uploader label', () => {
    expect(formatTrackAttribution({ createdAt: '2026-09-17T10:00:00.000Z' }, 'ru-RU', 'UTC'))
      .toBe('Загружено · 17 сентября 2026 г.');
  });
});
