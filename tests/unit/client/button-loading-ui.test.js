import { describe, expect, it, vi } from 'vitest';
import { setButtonLoading, withButtonLoading } from '../../../src/client/button-loading-ui.js';

function button() {
  const attributes = new Map();
  const classes = new Set();
  return {
    disabled: false,
    classList: { toggle: (name, value) => value ? classes.add(name) : classes.delete(name), contains: (name) => classes.has(name) },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name),
  };
}

describe('button loading state', () => {
  it('marks a button busy and restores its previous disabled state', () => {
    const target = button();
    setButtonLoading(target, true);
    expect(target.disabled).toBe(true);
    expect(target.classList.contains('is-loading')).toBe(true);
    expect(target.getAttribute('aria-busy')).toBe('true');
    setButtonLoading(target, false);
    expect(target.disabled).toBe(false);
    expect(target.classList.contains('is-loading')).toBe(false);
    expect(target.getAttribute('aria-busy')).toBeUndefined();
  });

  it('clears the spinner after a rejected action', async () => {
    const target = button();
    await expect(withButtonLoading(target, vi.fn().mockRejectedValue(new Error('failed')))).rejects.toThrow('failed');
    expect(target.disabled).toBe(false);
    expect(target.classList.contains('is-loading')).toBe(false);
  });
});
