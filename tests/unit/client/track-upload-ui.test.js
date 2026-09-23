import { beforeEach } from 'vitest';
import { preferences } from '../../../src/client/i18n.js';
beforeEach(() => { preferences.set('language', 'ru'); preferences.set('measurementSystem', 'metric'); });
import { describe, expect, it } from 'vitest';
import { renderTrackUploadDialogs, uploadMetadataHint, uploadMetadataPayload } from '../../../src/client/track-upload-ui.js';

describe('track upload dialogs', () => {
  it('offers both drag and drop and manual GPX selection', () => {
    const markup = renderTrackUploadDialogs();

    expect(markup).toContain('id="upload-dialog"');
    expect(markup).toContain('Перетащите GPX-файл сюда');
    expect(markup).toContain('for="gpx-file"');
    expect(markup).toContain('Выбрать файл вручную');
    expect(markup.indexOf('Перетащите GPX-файл сюда')).toBeLessThan(markup.indexOf('Тип маршрута'));
    expect(markup).toContain('id="upload-route-type"');
    expect(markup).toContain('name="routeType"');
    expect(markup).toContain('value="gravel-cycling"');
  });

  it('keeps processing, metadata editing, and completion actions in one dialog', () => {
    const markup = renderTrackUploadDialogs();

    expect(markup).toContain('id="upload-track-title"');
    expect(markup.indexOf('Тип маршрута')).toBeLessThan(markup.indexOf('Название'));
    expect(markup).toContain('Ссылки на трек в других сервисах');
    expect(markup).toContain('name="komoot"');
    expect(markup).toContain('name="strava"');
    expect(markup).toContain('name="garmin"');
    expect(markup).toContain('name="rideWithGps"');
    expect(markup).toContain('class="upload-links-value" id="upload-links-value"');
    expect(markup).toContain('id="open-uploaded-track"');
    expect(markup).toContain('Перейти к треку');
  });

  it('replaces each metadata row with its editor and shows service icons', () => {
    const markup = renderTrackUploadDialogs();

    expect(markup).toMatch(/upload-title-row[\s\S]*upload-metadata-view[\s\S]*upload-title-form[\s\S]*<\/section>/);
    expect(markup).toMatch(/upload-links-row[\s\S]*upload-metadata-view[\s\S]*upload-links-form[\s\S]*<\/section>/);
    expect(markup.match(/service-field-icon/g)).toHaveLength(4);
    expect(markup.indexOf('id="finish-processing"')).toBeLessThan(markup.indexOf('id="open-uploaded-track"'));
  });

  it('normalizes editable metadata into the PATCH payload shape', () => {
    expect(uploadMetadataPayload({
      title: '  Лесной круг  ',
      speedKmh: 20,
      routeType: 'gravel-cycling',
      links: { komoot: ' https://www.komoot.com/tour/1 ', strava: ' ' },
    })).toEqual({
      title: 'Лесной круг',
      speedKmh: 20,
      routeType: 'gravel-cycling',
      externalLinks: { komoot: 'https://www.komoot.com/tour/1' },
    });
  });

  it('explains when metadata can be edited for each processing state', () => {
    expect(uploadMetadataHint(false)).toBe('Можно изменить, пока идёт обработка');
    expect(uploadMetadataHint(true)).toBe('Можно изменить сейчас или позже в режиме редактирования трека');
  });
});
