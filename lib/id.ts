import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Short, URL-safe, unambiguous id (12 chars). */
export function newId(): string {
  const bytes = randomBytes(16)
  let out = ''
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}
