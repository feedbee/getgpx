import { setButtonLoading } from './button-loading-ui.js';

export function bindUploadInteractions({ uploadFlow, collection, getCurrentUser, getPublicTrackId, isMyTracksPage,
  documentRef = document, windowRef = window }) {
  documentRef.querySelector('#gpx-file').addEventListener('change', (event) => {
    if (event.target.files[0]) {
      documentRef.querySelector('#upload-dialog').hidden = true;
      uploadFlow.uploadFile(event.target.files[0]);
    }
    event.target.value = '';
  });
  documentRef.addEventListener('click', (event) => {
    if (!event.target.closest('[data-auth-upload]') || !getCurrentUser()) return;
    documentRef.querySelector('#upload-dialog').hidden = false;
    documentRef.querySelector('#upload-dropzone').focus();
  });
  documentRef.querySelector('#close-upload-dialog').addEventListener('click', () => {
    documentRef.querySelector('#upload-dialog').hidden = true;
  });
  const uploadDropzone = documentRef.querySelector('#upload-dropzone');
  uploadDropzone.addEventListener('dragover', (event) => { event.preventDefault(); uploadDropzone.classList.add('is-dragging'); });
  uploadDropzone.addEventListener('dragleave', () => uploadDropzone.classList.remove('is-dragging'));
  uploadDropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadDropzone.classList.remove('is-dragging');
    if (getCurrentUser() && event.dataTransfer.files[0]) {
      documentRef.querySelector('#upload-dialog').hidden = true;
      uploadFlow.uploadFile(event.dataTransfer.files[0]);
    }
  });
  documentRef.querySelector('#close-processing').addEventListener('click', () => {
    uploadFlow.stop();
    documentRef.querySelector('#processing-overlay').hidden = true;
  });
  documentRef.querySelector('#finish-processing').addEventListener('click', async () => {
    documentRef.querySelector('#processing-overlay').hidden = true;
    if (isMyTracksPage) await collection.load({ reset: true });
  });
  documentRef.querySelector('#open-uploaded-track').addEventListener('click', (event) => {
    setButtonLoading(event.currentTarget, true);
    windowRef.location.assign(`/tracks/${event.currentTarget.dataset.trackId}`);
  });
  documentRef.querySelector('#edit-upload-title').addEventListener('click', () => {
    uploadFlow.setUploadMetadataEditing('#upload-title-row', true);
    documentRef.querySelector('#upload-track-title').focus();
  });
  documentRef.querySelector('#cancel-upload-title').addEventListener('click', () => {
    uploadFlow.setUploadMetadataEditing('#upload-title-row', false);
    uploadFlow.renderUploadMetadata();
  });
  documentRef.querySelector('#edit-upload-links').addEventListener('click', () => {
    uploadFlow.setUploadMetadataEditing('#upload-links-row', true);
    documentRef.querySelector('#upload-links-form input').focus();
  });
  documentRef.querySelector('#cancel-upload-links').addEventListener('click', () => {
    uploadFlow.setUploadMetadataEditing('#upload-links-row', false);
    uploadFlow.renderUploadMetadata();
  });

  documentRef.querySelector('#upload-title-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (await uploadFlow.saveUploadMetadata({ title: documentRef.querySelector('#upload-track-title').value }, event.submitter)) uploadFlow.setUploadMetadataEditing('#upload-title-row', false);
  });
  documentRef.querySelector('#upload-links-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const links = Object.fromEntries(['komoot', 'strava', 'garmin', 'rideWithGps'].map((service) => [service, formData.get(service)]));
    if (await uploadFlow.saveUploadMetadata({ links }, event.submitter)) uploadFlow.setUploadMetadataEditing('#upload-links-row', false);
  });
  documentRef.querySelector('#retry-processing').addEventListener('click', (event) => uploadFlow.retryProcessing(event.currentTarget));

  documentRef.querySelector('.source-popover').addEventListener('click', async (event) => {
    if (!event.target.closest('.source-retry')) return;
    await uploadFlow.retryExisting(getPublicTrackId());
  });
}
