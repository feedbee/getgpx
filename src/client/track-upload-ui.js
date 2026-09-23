import { t, htmlMessage, messageAttribute } from './i18n.js';
import { renderExternalLinkFields } from './external-track-links-ui.js';
import { renderRouteTypeDropdown } from './route-type-ui.js';

export function uploadMetadataHint(complete) {
  return complete
    ? t('upload.hintComplete')
    : t('upload.hintProcessing');
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
        <button class="upload-dialog-close" id="close-upload-dialog" type="button" ${messageAttribute('aria-label', 'upload.close')}>×</button>
        <p class="route-kicker">${htmlMessage('upload.new')}</p>
        <h2 id="upload-dialog-title">${htmlMessage('upload.title')}</h2>
        <label class="upload-dropzone" id="upload-dropzone" for="gpx-file" tabindex="0">
          <span class="upload-dropzone-icon" aria-hidden="true">＋</span>
          <strong>${htmlMessage('upload.drop')}</strong>
          <span>${htmlMessage('upload.or')}</span>
          <span class="upload-manual-button">${htmlMessage('upload.choose')}</span>
          <small>${htmlMessage('upload.support')}</small>
        </label>
      </section>
    </div>
    <div class="processing-overlay" id="processing-overlay" hidden>
      <section class="processing-card" role="dialog" aria-modal="true" aria-labelledby="processing-title">
        <div class="processing-heading">
          <div><p class="route-kicker">${htmlMessage('upload.new')}</p><h2 id="processing-title">${htmlMessage('upload.creating')}</h2></div>
          <button class="processing-close" id="close-processing" type="button" ${messageAttribute('aria-label', 'common.close')} hidden>×</button>
        </div>
        <section class="upload-metadata" id="upload-metadata" aria-labelledby="upload-metadata-title" hidden>
          <div class="upload-metadata-heading"><h3 id="upload-metadata-title">${htmlMessage('upload.info')}</h3><span id="upload-metadata-hint">${uploadMetadataHint(false)}</span></div>
          <div class="upload-metadata-row upload-route-type-row">${renderRouteTypeDropdown({ id: 'upload-route-type', name: 'routeType', selected: 'cycling' })}</div>
          <div class="upload-metadata-row" id="upload-title-row">
            <div class="upload-metadata-view"><div><span>${htmlMessage('common.title')}</span><strong id="upload-track-title-value">—</strong></div><button class="metadata-edit-button" id="edit-upload-title" type="button" ${messageAttribute('aria-label', 'upload.changeTitle')} ${messageAttribute('title', 'upload.changeTitle')}>✎</button></div>
            <form class="upload-inline-editor" id="upload-title-form" hidden>
              <label for="upload-track-title">${htmlMessage('common.title')}</label>
              <input id="upload-track-title" name="title" required maxlength="200" />
              <div><button type="button" id="cancel-upload-title">${htmlMessage('common.cancel')}</button><button class="button-primary" type="submit">${htmlMessage('common.save')}</button></div>
            </form>
          </div>
          <div class="upload-metadata-row upload-links-summary" id="upload-links-row">
            <div class="upload-metadata-view"><div><span>${htmlMessage('common.links')}</span><div class="upload-links-value" id="upload-links-value">${htmlMessage('common.noLinks')}</div></div><button class="metadata-edit-button" id="edit-upload-links" type="button" ${messageAttribute('aria-label', 'upload.changeLinks')} ${messageAttribute('title', 'upload.changeLinks')}>✎</button></div>
            <form class="upload-links-form" id="upload-links-form" hidden>
              ${renderExternalLinkFields('upload-link')}
              <div><button type="button" id="cancel-upload-links">${htmlMessage('common.cancel')}</button><button class="button-primary" type="submit">${htmlMessage('common.save')}</button></div>
            </form>
          </div>
          <p class="form-error" id="upload-metadata-error" hidden></p>
        </section>
        <div class="processing-status" id="processing-status"><span class="processing-spinner" aria-hidden="true"></span><strong>${htmlMessage('upload.processing')}</strong><small id="processing-status-copy">${htmlMessage('upload.wait')}</small></div>
        <ol class="processing-steps" aria-live="polite">
          <li data-processing-step="UPLOADING">${htmlMessage('upload.file')}</li><li data-processing-step="QUEUED">${htmlMessage('upload.queue')}</li>
          <li data-processing-step="PARSING">${htmlMessage('upload.parse')}</li><li data-processing-step="ENRICHING">${htmlMessage('upload.enrich')}</li>
          <li data-processing-step="COMPLETE">${htmlMessage('upload.ready')}</li>
        </ol>
        <p class="processing-error" id="processing-error" hidden></p>
        <details class="processing-details" id="processing-details" hidden><summary>${htmlMessage('upload.details')}</summary><code id="processing-code"></code></details>
        <div class="processing-actions"><button id="retry-processing" type="button" hidden>${htmlMessage('upload.retry')}</button><button id="finish-processing" type="button" hidden>${htmlMessage('common.close')}</button><button class="button-primary" id="open-uploaded-track" type="button" hidden>${htmlMessage('upload.open')}</button></div>
      </section>
    </div>`;
}
