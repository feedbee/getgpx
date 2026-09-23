import { languages, measurementSystems } from './locales/registry.js';
import { preferences, htmlMessage, messageAttribute, t } from './i18n.js';
export function renderPreferencesControl() {
  return `<div class="preferences-control">
    <button id="preferences-trigger" type="button" aria-expanded="false" aria-controls="preferences-popover" ${messageAttribute('aria-label', 'preferences.open')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg></button>
    <div id="preferences-popover" class="preferences-popover" hidden>
      <div class="preferences-group" role="group" ${messageAttribute('aria-label', 'preferences.language')}>
        <p class="preferences-heading">${htmlMessage('preferences.language')}</p>
        <div class="preferences-languages">${Object.entries(languages).map(([id, name]) => `<button class="preferences-option" type="button" data-preference="language" data-value="${id}" lang="${id}" aria-pressed="${id === preferences.value.language}">${name}</button>`).join('')}</div>
      </div>
      <div class="preferences-group" role="group" ${messageAttribute('aria-label', 'preferences.units')}>
        <p class="preferences-heading">${htmlMessage('preferences.units')}</p>
        <div class="preferences-systems">${measurementSystems.map(id => `<button class="preferences-option" type="button" data-preference="measurementSystem" data-value="${id}" aria-pressed="${id === preferences.value.measurementSystem}">${t(`preferences.${id}`)}</button>`).join('')}</div>
      </div>
      <p id="preferences-storage-note" role="status" hidden>${htmlMessage('preferences.sessionOnly')}</p>
      <p id="preferences-blocked-note" role="status" hidden></p>
    </div>
  </div>`;
}
export function setupPreferencesControl(root = document, { blockedReason = () => null, reload = () => window.location.reload() } = {}) {
  const trigger = root.querySelector('#preferences-trigger');
  const popover = root.querySelector('#preferences-popover');
  const close = (restoreFocus = false) => {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  trigger.addEventListener('click', () => {
    const open = popover.hidden;
    popover.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) popover.querySelector?.('.preferences-languages [aria-pressed="true"]')?.focus();
  });
  popover.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
  });
  root.addEventListener('pointerdown', event => { if (!event.target.closest('.preferences-control')) close(); });
  root.addEventListener('focusin', event => { if (!event.target.closest('.preferences-control')) close(); });
  const change = (field, value) => {
    const reason = blockedReason();
    if (reason) {
      const note = root.querySelector('#preferences-blocked-note');
      note.textContent = t(reason);
      note.hidden = false;
      return;
    }
    const saved = preferences.set(field, value);
    root.querySelector('#preferences-storage-note').hidden = saved;
    if (saved) reload();
    else popover.querySelectorAll?.(`[data-preference="${field}"]`).forEach(option => {
      option.setAttribute('aria-pressed', String(option.dataset.value === preferences.value[field]));
    });
  };
  popover.addEventListener('click', event => {
    const choice = event.target.closest('button[data-preference]');
    if (choice) change(choice.dataset.preference, choice.dataset.value);
  });
}
