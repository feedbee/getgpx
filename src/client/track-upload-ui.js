import { renderExternalLinkFields } from './external-track-links-ui.js';
import { renderRouteTypeDropdown } from './route-type-ui.js';

export function uploadMetadataHint(complete) {
  return complete
    ? 'Можно изменить сейчас или позже в режиме редактирования трека'
    : 'Можно изменить, пока идёт обработка';
}

export function uploadMetadataPayload({ title, speedKmh, routeType, links }) {
  const externalLinks = Object.fromEntries(Object.entries(links)
    .map(([service, url]) => [service, String(url || '').trim()])
    .filter(([, url]) => url));
  return { title: String(title || '').normalize('NFKC').trim(), speedKmh, routeType, externalLinks };
}

export function renderTrackUploadDialogs() {
  return `
    <div class="upload-overlay" id="upload-dialog" hidden>
      <section class="upload-card" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
        <button class="upload-dialog-close" id="close-upload-dialog" type="button" aria-label="Закрыть окно загрузки">×</button>
        <p class="route-kicker">НОВЫЙ ТРЕК</p>
        <h2 id="upload-dialog-title">Загрузить трек</h2>
        <label class="upload-dropzone" id="upload-dropzone" for="gpx-file" tabindex="0">
          <span class="upload-dropzone-icon" aria-hidden="true">＋</span>
          <strong>Перетащите GPX-файл сюда</strong>
          <span>или</span>
          <span class="upload-manual-button">Выбрать файл вручную</span>
          <small>Поддерживается формат GPX, до 25 MiB</small>
        </label>
      </section>
    </div>
    <div class="processing-overlay" id="processing-overlay" hidden>
      <section class="processing-card" role="dialog" aria-modal="true" aria-labelledby="processing-title">
        <div class="processing-heading">
          <div><p class="route-kicker">НОВЫЙ ТРЕК</p><h2 id="processing-title">Создаём трек</h2></div>
          <button class="processing-close" id="close-processing" type="button" aria-label="Закрыть окно" hidden>×</button>
        </div>
        <section class="upload-metadata" id="upload-metadata" aria-labelledby="upload-metadata-title" hidden>
          <div class="upload-metadata-heading"><h3 id="upload-metadata-title">Информация о треке</h3><span id="upload-metadata-hint">${uploadMetadataHint(false)}</span></div>
          <div class="upload-metadata-row upload-route-type-row">${renderRouteTypeDropdown({ id: 'upload-route-type', name: 'routeType', selected: 'cycling' })}</div>
          <div class="upload-metadata-row" id="upload-title-row">
            <div class="upload-metadata-view"><div><span>Название</span><strong id="upload-track-title-value">—</strong></div><button class="metadata-edit-button" id="edit-upload-title" type="button" aria-label="Изменить название" title="Изменить название">✎</button></div>
            <form class="upload-inline-editor" id="upload-title-form" hidden>
              <label for="upload-track-title">Название</label>
              <input id="upload-track-title" name="title" required maxlength="200" />
              <div><button type="button" id="cancel-upload-title">Отмена</button><button type="submit">Сохранить</button></div>
            </form>
          </div>
          <div class="upload-metadata-row upload-links-summary" id="upload-links-row">
            <div class="upload-metadata-view"><div><span>Ссылки на трек в других сервисах</span><div class="upload-links-value" id="upload-links-value">Не добавлены</div></div><button class="metadata-edit-button" id="edit-upload-links" type="button" aria-label="Изменить ссылки" title="Изменить ссылки">✎</button></div>
            <form class="upload-links-form" id="upload-links-form" hidden>
              ${renderExternalLinkFields('upload-link')}
              <div><button type="button" id="cancel-upload-links">Отмена</button><button type="submit">Сохранить</button></div>
            </form>
          </div>
          <p class="form-error" id="upload-metadata-error" hidden></p>
        </section>
        <div class="processing-status" id="processing-status"><span class="processing-spinner" aria-hidden="true"></span><strong>Обрабатываем трек</strong><small id="processing-status-copy">Это может занять некоторое время</small></div>
        <ol class="processing-steps" aria-live="polite">
          <li data-processing-step="UPLOADING">Загружаем файл</li><li data-processing-step="QUEUED">Ставим в обработку</li>
          <li data-processing-step="PARSING">Разбираем GPX и считаем маршрут</li><li data-processing-step="ENRICHING">Определяем дороги и покрытия</li>
          <li data-processing-step="COMPLETE">Трек готов</li>
        </ol>
        <p class="processing-error" id="processing-error" hidden></p>
        <details class="processing-details" id="processing-details" hidden><summary>Техническая информация</summary><code id="processing-code"></code></details>
        <div class="processing-actions"><button id="retry-processing" type="button" hidden>Повторить анализ</button><button id="finish-processing" type="button" hidden>Закрыть окно</button><button id="open-uploaded-track" type="button" hidden>Перейти к треку</button></div>
      </section>
    </div>`;
}
