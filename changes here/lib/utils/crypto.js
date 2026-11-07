const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const HASH = 'SHA-256';

function getWebCrypto() {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto;
  return null;
}

function base64ToBytes(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function encryptData(plaintext, password) {
  const c = getWebCrypto();
  if (!c) throw new Error('Web Crypto API not available');

  const salt = c.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = c.getRandomValues(new Uint8Array(IV_LENGTH));

  const keyMaterial = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt']
  );

  const encrypted = await c.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    encrypted: true,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptData(payload, password) {
  const c = getWebCrypto();
  if (!c) throw new Error('Web Crypto API not available');

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const encryptedData = base64ToBytes(payload.data);

  const keyMaterial = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['decrypt']
  );

  const decrypted = await c.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );

  return new TextDecoder().decode(decrypted);
}
