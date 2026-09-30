import { t, bindText, bindAttribute, preferences, currentUnit } from './i18n.js';
import { errorMessage } from './errors-ui.js';
import { createSpeedDraft, distanceValue } from './measurements.js';
import { selectedRouteType, setRouteTypeDropdown } from './route-type-ui.js';
import { withButtonLoading } from './button-loading-ui.js';

export function createTrackEditor({ trackApi, uploadFlow, getPublicTrackId, getPublicTrackData, onUpdated, documentRef = document }) {
  let managedTrackId = null;
  let managedTitle = '';

  function setExternalLinkFields(links = {}) {
    documentRef.querySelector('#edit-track-komoot').value = links.komoot || '';
    documentRef.querySelector('#edit-track-strava').value = links.strava || '';
    documentRef.querySelector('#edit-track-garmin').value = links.garmin || '';
    documentRef.querySelector('#edit-track-ride-with-gps').value = links.rideWithGps || '';
  }

  function externalLinksFromEditor() {
    return {
      komoot: documentRef.querySelector('#edit-track-komoot').value,
      strava: documentRef.querySelector('#edit-track-strava').value,
      garmin: documentRef.querySelector('#edit-track-garmin').value,
      rideWithGps: documentRef.querySelector('#edit-track-ride-with-gps').value,
    };
  }

  function open({ id, title, speedKmh, routeType, externalLinks }) {
    managedTrackId = id;
    managedTitle = title;
    documentRef.querySelector('#edit-track-title').value = title;
    setSpeedDraft(speedKmh || 20);
    setRouteTypeDropdown(documentRef.querySelector('#edit-track-route-type'), routeType);
    setExternalLinkFields(externalLinks);
    documentRef.querySelector('#edit-track-error').hidden = true;
    documentRef.querySelector('#edit-track-dialog').showModal();
  }

  async function openFromList(track, button) {
    await withButtonLoading(button, async () => {
      const response = await trackApi.management(track.id);
      if (!response.ok) return;
      const { data } = await response.json();
      open(data);
    });
  }

  documentRef.querySelector('#edit-track').addEventListener('click', () => open({
    id: getPublicTrackId(),
    title: documentRef.querySelector('#edit-track-title').value,
    speedKmh: speedDraft.canonical,
    routeType: getPublicTrackData()?.routeType,
    externalLinks: getPublicTrackData()?.externalLinks,
  }));
  documentRef.querySelector('#cancel-track-edit').addEventListener('click', () => documentRef.querySelector('#edit-track-dialog').close());
  documentRef.querySelector('#edit-track-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    speedDraft.update(speedInput.value, preferences.value);
    if (!speedDraft.valid) {
      const validation = documentRef.querySelector('#edit-track-error');
      bindText(validation, () => errorMessage({ code: 'INVALID_TRACK_SPEED' }));
      validation.hidden = false;
      return;
    }
    const error = documentRef.querySelector('#edit-track-error');
    error.hidden = true;
    try {
      await withButtonLoading(event.submitter, async () => {
        const response = await trackApi.update({ id: managedTrackId, details: {
          title: documentRef.querySelector('#edit-track-title').value,
          speedKmh: speedDraft.canonical,
          routeType: selectedRouteType(documentRef.querySelector('#edit-track-route-type')),
          externalLinks: externalLinksFromEditor(),
        } });
        const payload = await response.json();
        if (!response.ok) {
          bindText(error, () => errorMessage(payload?.error));
          error.hidden = false;
          return;
        }
        documentRef.querySelector('#edit-track-dialog').close();
        managedTitle = payload.data.title;
        await onUpdated(payload.data);
      });
    } catch (saveError) {
      bindText(error, () => errorMessage(saveError));
      error.hidden = false;
    }
  });
  documentRef.querySelector('#replacement-gpx').addEventListener('change', (event) => {
    if (event.target.files[0]) {
      documentRef.querySelector('#edit-track-dialog').close();
      uploadFlow.replaceTrackFile(event.target.files[0], managedTrackId);
    }
    event.target.value = '';
  });
  const speedInput = documentRef.querySelector('#edit-track-speed');
  let speedDraft = createSpeedDraft(20);
  function setSpeedDraft(value) {
    speedDraft = createSpeedDraft(value);
    speedInput.value = speedDraft.display(preferences.value);
  }
  function refreshSpeedInput(previous) {
    if (previous) speedDraft.update(speedInput.value, previous);
    speedInput.value = speedDraft.display(preferences.value);
    speedInput.dataset.min = String(distanceValue(1, preferences.value));
    speedInput.dataset.max = String(distanceValue(50, preferences.value));
    speedInput.dataset.step = String(distanceValue(0.1, preferences.value));
    bindAttribute(speedInput, 'aria-description', () => errorMessage({ code: 'INVALID_TRACK_SPEED' }));
  }
  speedInput.addEventListener('input', () => speedDraft.update(speedInput.value, preferences.value));
  bindText(documentRef.querySelector('#speed-input-label'), () => t('edit.speed', { unit: currentUnit('speed') }));
  function setFields(data) {
    documentRef.querySelector('#edit-track-title').value = data.title;
    setSpeedDraft(data.speedKmh || 20);
    setRouteTypeDropdown(documentRef.querySelector('#edit-track-route-type'), data.routeType);
    setExternalLinkFields(data.externalLinks);
  }

  return { open, openFromList, setFields, refreshSpeedInput, get managedTitle() { return managedTitle; } };
}
