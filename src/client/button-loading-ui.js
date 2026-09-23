const previousDisabled = new WeakMap();

export function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    if (button.classList.contains('is-loading')) return;
    previousDisabled.set(button, button.disabled);
    button.disabled = true;
    button.classList.toggle('is-loading', true);
    button.setAttribute('aria-busy', 'true');
    return;
  }
  if (!button.classList.contains('is-loading')) return;
  button.disabled = previousDisabled.get(button) ?? false;
  previousDisabled.delete(button);
  button.classList.toggle('is-loading', false);
  button.removeAttribute('aria-busy');
}

export async function withButtonLoading(button, action) {
  setButtonLoading(button, true);
  try {
    return await action();
  } finally {
    setButtonLoading(button, false);
  }
}
