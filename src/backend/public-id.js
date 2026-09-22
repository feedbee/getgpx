import { randomBytes } from 'node:crypto';

export const PUBLIC_ID_ALPHABET = '_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const PUBLIC_ID_LENGTH = 21;

export function createPublicId() {
  let id = '';
  while (id.length < PUBLIC_ID_LENGTH) {
    for (const byte of randomBytes(PUBLIC_ID_LENGTH - id.length)) {
      const index = byte & 63;
      if (index < PUBLIC_ID_ALPHABET.length) id += PUBLIC_ID_ALPHABET[index];
    }
  }
  return id;
}

export function isPublicId(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 64
    && [...value].every((character) => PUBLIC_ID_ALPHABET.includes(character));
}
