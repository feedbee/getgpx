import { beforeEach } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
beforeEach(() => { preferences.set('language', 'ru'); preferences.set('measurementSystem', 'metric'); });
import { describe, expect, it } from 'vitest';
import { formatTrackAttribution, resolveTrackUploader } from '../../../src/client/track-meta-ui.js';

describe('track upload attribution', () => {
  it('formats uploader and upload date for the route header', () => {
    expect(formatTrackAttribution({
      createdAt: '2026-09-17T10:00:00.000Z',
      uploader: { displayName: 'Jan Kowalski' },
    }, 'ru-RU', 'UTC')).toBe('Jan Kowalski · 17 сентября 2026 г.');
  });

  it('falls back to a neutral uploader label', () => {
    expect(formatTrackAttribution({ createdAt: '2026-09-17T10:00:00.000Z' }, 'ru-RU', 'UTC'))
      .toBe('Загружено · 17 сентября 2026 г.');
  });

  it('uses the current profile only when track ownership has been verified', () => {
    const currentUser = { displayName: 'Anna Nowak', avatarUrl: 'https://example.com/anna.jpg' };

    expect(resolveTrackUploader({ uploader: null }, currentUser, false)).toBeNull();
    expect(resolveTrackUploader({ uploader: null }, currentUser, true)).toEqual(currentUser);
  });
});
