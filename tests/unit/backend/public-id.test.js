import { describe, expect, it } from 'vitest';
import { createPublicId, isPublicId, PUBLIC_ID_LENGTH } from '../../../src/backend/public-id.js';

describe('public track ids', () => {
  it('generates Nano ID-sized URL-safe values without hyphens', () => {
    const ids = Array.from({ length: 100 }, () => createPublicId());

    expect(ids.every((id) => id.length === PUBLIC_ID_LENGTH)).toBe(true);
    expect(ids.every((id) => /^[A-Za-z0-9_]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts stored ids of different lengths for future format migrations', () => {
    expect(isPublicId('Abc_123')).toBe(true);
    expect(isPublicId('with-hyphen')).toBe(false);
    expect(isPublicId('with/slash')).toBe(false);
  });
});
