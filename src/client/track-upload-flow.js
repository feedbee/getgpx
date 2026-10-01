import { errorMessage, errorFromPayload } from './errors-ui.js';
import { t, bindText } from './i18n.js';
import { availableExternalTrackLinks, renderExternalTrackLinks } from './external-track-links-ui.js';
import { setRouteTypeDropdown } from './route-type-ui.js';
import { uploadMetadataHint, uploadMetadataPayload } from './track-upload-ui.js';
import { withButtonLoading } from './button-loading-ui.js';

export function createUploadFlow({ trackApi, isAuthenticated, getPublicTrackId, documentRef = document }) {
  let activeTrackId = null;
  let metadata = null;
  let operation = 'create';

  function prepareProcessing(action) {
    operation = action;
    metadata = null;
    activeTrackId = null;
    for (const selector of ['#processing-error', '#processing-details', '#retry-processing',
      '#open-uploaded-track', '#finish-processing', '#close-processing', '#upload-metadata', '#upload-metadata-error']) {
      documentRef.querySelector(selector).hidden = true;
    }
    setUploadMetadataEditing('#upload-title-row', false);
    setUploadMetadataEditing('#upload-links-row', false);
    documentRef.querySelector('#processing-status').classList.remove('is-complete', 'is-failed');
    bindText(documentRef.querySelector('#processing-kicker'), () => t(action === 'create' ? 'upload.new' : 'upload.existing'));
    bindText(documentRef.querySelector('#processing-title'), () => t(`upload.${operation}Processing`));
    bindText(documentRef.querySelector('#processing-status').querySelector('strong'), () => t('upload.processing'));
    bindText(documentRef.querySelector('#processing-status-copy'), () => t('upload.wait'));
    documentRef.querySelector('#processing-overlay').hidden = false;
  }
  const processingOrder = ['UPLOADING', 'QUEUED', 'PARSING', 'ENRICHING', 'COMPLETE'];

  function updateProcessing(step) {
    const activeIndex = processingOrder.indexOf(step);
    documentRef.querySelectorAll('[data-processing-step]').forEach((item) => {
      const index = processingOrder.indexOf(item.dataset.processingStep);
      item.classList.toggle('is-complete', activeIndex >= 0 && index < activeIndex);
      item.classList.toggle('is-active', item.dataset.processingStep === step);
    });
  }

  function showProcessingError(error) {
    const failedStep = ['INVALID_GPX', 'GPX_POINT_LIMIT'].includes(error.code) ? 'PARSING'
      : ['ENRICHMENT_UNAVAILABLE', 'PROCESSING_INTERRUPTED', 'ANALYSIS_STORAGE_UNAVAILABLE'].includes(error.code)
        ? 'ENRICHING' : 'UPLOADING';
    updateProcessing(failedStep);
    const message = documentRef.querySelector('#processing-error');
    bindText(message, () => errorMessage(error));
    message.hidden = false;
    const details = documentRef.querySelector('#processing-details');
    details.hidden = false;
    bindText(documentRef.querySelector('#processing-code'), () => /^[A-Z_]{1,50}$/.test(error.code) ? error.code : 'UNKNOWN_ERROR');
    documentRef.querySelector('#retry-processing').hidden = ![
      'ENRICHMENT_UNAVAILABLE', 'PROCESSING_INTERRUPTED', 'ANALYSIS_STORAGE_UNAVAILABLE', 'TRACK_FILE_UNAVAILABLE',
    ].includes(error.code);
    documentRef.querySelector('#close-processing').hidden = false;
    const status = documentRef.querySelector('#processing-status');
    status.classList.add('is-failed');
    bindText(status.querySelector('strong'), () => t('upload.stopped'));
    bindText(documentRef.querySelector('#processing-status-copy'), () => t('upload.fix'));
  }

  function renderUploadMetadata() {
    if (!metadata) return;
    documentRef.querySelector('#upload-metadata').hidden = false;
    bindText(documentRef.querySelector('#upload-track-title-value'), () => metadata.title);
    documentRef.querySelector('#upload-track-title').value = metadata.title;
    setRouteTypeDropdown(documentRef.querySelector('#upload-route-type'), metadata.routeType);
    const links = availableExternalTrackLinks(metadata.externalLinks);
    const linksValue = documentRef.querySelector('#upload-links-value');
    if (links.length) renderExternalTrackLinks(linksValue, metadata.externalLinks, null, { inline: true });
    else {
      linksValue.replaceChildren(t('common.noLinks'));
      linksValue.hidden = false;
    }
    const linksForm = documentRef.querySelector('#upload-links-form');
    [...linksForm.elements].forEach((field) => {
      if (field.tagName === 'INPUT') field.value = metadata.externalLinks[field.name] || '';
    });
  }

  function setUploadMetadataEditing(rowSelector, editing) {
    const row = documentRef.querySelector(rowSelector);
    row.classList.toggle('is-editing', editing);
    row.querySelector('.upload-metadata-view').hidden = editing;
    row.querySelector('form').hidden = !editing;
  }

  async function loadUploadMetadata(trackId) {
    if (metadata?.id === trackId) return;
    const response = await trackApi.publicTrack(trackId);
    if (!response.ok) return;
    const { data } = await response.json();
    if (activeTrackId !== trackId) return;
    metadata = {
      id: trackId,
      title: data.title,
      speedKmh: data.metrics?.speedKmh || 20,
      routeType: data.routeType,
      externalLinks: data.externalLinks || {},
    };
    renderUploadMetadata();
  }

  function showTrackCreated(trackId) {
    const status = documentRef.querySelector('#processing-status');
    status.classList.add('is-complete');
    bindText(documentRef.querySelector('#processing-title'), () => t(`upload.${operation}Complete`));
    bindText(status.querySelector('strong'), () => t('upload.complete'));
    bindText(documentRef.querySelector('#processing-status-copy'), () => t('upload.viewReady'));
    bindText(documentRef.querySelector('#upload-metadata-hint'), () => uploadMetadataHint(true));
    documentRef.querySelector('#open-uploaded-track').hidden = false;
    documentRef.querySelector('#finish-processing').hidden = false;
    documentRef.querySelector('#close-processing').hidden = false;
    documentRef.querySelector('#open-uploaded-track').dataset.trackId = trackId;
  }

  async function pollTrackStatus(trackId) {
    while (activeTrackId === trackId) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (activeTrackId !== trackId) return;
      const response = await trackApi.status(trackId);
      if (!response.ok) throw new Error(t('errors.status'));
      const { data } = await response.json();
      if (activeTrackId !== trackId) return;
      updateProcessing(data.step);
      if (data.status === 'READY') await loadUploadMetadata(trackId);
      if (data.status === 'READY') {
        activeTrackId = null;
        updateProcessing('COMPLETE');
        showTrackCreated(trackId);
        return;
      }
      if (data.status === 'FAILED') {
        activeTrackId = trackId;
        showProcessingError(data.error);
        return;
      }
    }
  }

  async function uploadFile(file) {
    if (!isAuthenticated()) return;
    prepareProcessing('create');
    updateProcessing('UPLOADING');
    try {
      const response = await trackApi.upload({ file, routeType: 'cycling' });
      const payload = await response.json();
      if (!response.ok) throw errorFromPayload(payload);
      activeTrackId = payload.data.id;
      updateProcessing(payload.data.step);
      await pollTrackStatus(activeTrackId);
    } catch (uploadError) {
      showProcessingError(uploadError);
    }
  }

  async function replaceTrackFile(file, trackId = getPublicTrackId()) {
    if (!isAuthenticated() || !trackId) return;
    prepareProcessing('replace');
    updateProcessing('UPLOADING');
    try {
      const response = await trackApi.replace({ id: trackId, file });
      const payload = await response.json();
      if (!response.ok) throw errorFromPayload(payload);
      activeTrackId = trackId;
      updateProcessing(payload.data.step);
      await pollTrackStatus(trackId);
    } catch (replaceError) {
      showProcessingError(replaceError);
    }
  }

  async function saveUploadMetadata({ title, routeType, links }, button = null) {
    if (!metadata || activeTrackId) return false;
    const payload = uploadMetadataPayload({
      title: title ?? metadata.title,
      speedKmh: metadata.speedKmh,
      routeType: routeType ?? metadata.routeType,
      links: links ?? metadata.externalLinks,
    });
    const error = documentRef.querySelector('#upload-metadata-error');
    error.hidden = true;
    try {
      return await withButtonLoading(button, async () => {
        const response = await trackApi.update({ id: metadata.id, details: payload });
        const responsePayload = await response.json();
        if (!response.ok) {
          bindText(error, () => errorMessage(responsePayload?.error));
          error.hidden = false;
          return false;
        }
        metadata.title = responsePayload.data.title;
        metadata.routeType = responsePayload.data.routeType;
        metadata.externalLinks = responsePayload.data.externalLinks || {};
        renderUploadMetadata();
        return true;
      });
    } catch (saveError) {
      bindText(error, () => errorMessage(saveError));
      error.hidden = false;
      return false;
    }
  }

  async function retryProcessing(button) {
    if (!activeTrackId) return;
    const trackId = activeTrackId;
    prepareProcessing('retry');
    activeTrackId = trackId;
    try {
      await withButtonLoading(button, async () => {
        const response = await trackApi.retry(activeTrackId);
        const payload = await response.json();
        if (!response.ok) {
          showProcessingError({ message: errorMessage(payload?.error), code: payload?.error?.code || 'RETRY_FAILED' });
          return;
        }
        documentRef.querySelector('#processing-error').hidden = true;
        documentRef.querySelector('#processing-details').hidden = true;
        documentRef.querySelector('#retry-processing').hidden = true;
        documentRef.querySelector('#close-processing').hidden = true;
        documentRef.querySelector('#processing-status').classList.remove('is-failed');
        bindText(documentRef.querySelector('#processing-status').querySelector('strong'), () => t('upload.processing'));
        bindText(documentRef.querySelector('#processing-status-copy'), () => t('upload.wait'));
        updateProcessing(payload.data.step);
        await pollTrackStatus(activeTrackId);
      });
    } catch (retryError) {
      showProcessingError(retryError);
    }
  }

  async function retryExisting(trackId) {
    const response = await trackApi.retry(trackId);
    const payload = await response.json();
    if (!response.ok) return;
    prepareProcessing('retry');
    activeTrackId = trackId;
    updateProcessing(payload.data.step);
    await pollTrackStatus(trackId);
  }

  return {
    uploadFile, replaceTrackFile, renderUploadMetadata, setUploadMetadataEditing,
    saveUploadMetadata, retryProcessing, retryExisting,
    stop() { activeTrackId = null; },
  };
}
