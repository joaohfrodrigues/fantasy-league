// Server-only helpers for league passwords and identifiers.
// Uses the Web Crypto API (no native dependencies) so it runs on Node and edge.
// The `.server.ts` suffix keeps this out of the client bundle.

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
// Crockford-ish base32 without easily-confused characters (no i, l, o, u, 0, 1).
const TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstvwxyz";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Hash a password with a fresh random salt. Returns hex-encoded hash + salt. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await derive(password, salt);
  return { hash: toHex(hash), salt: toHex(salt) };
}

/** Constant-time verification of a password against a stored hash + salt. */
export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string,
): Promise<boolean> {
  const expected = fromHex(hashHex);
  const actual = await derive(password, fromHex(saltHex));
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

/** A short, URL-safe, random league slug (lowercase letters + digits). */
export function generateSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return out;
}

/** A readable, high-entropy shared password formatted as xxxx-xxxx-xxxx. */
export function generatePassword(): string {
  const groups = 3;
  const perGroup = 4;
  const bytes = crypto.getRandomValues(new Uint8Array(groups * perGroup));
  const chars = Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]);
  const parts: string[] = [];
  for (let g = 0; g < groups; g++)
    parts.push(chars.slice(g * perGroup, g * perGroup + perGroup).join(""));
  return parts.join("-");
}
