const PRIVATE_KEY_STORAGE = "praww_private_key";
const PUBLIC_KEY_STORAGE = "praww_public_key";

export async function generateKeyPair() {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKeyJwk(publicKey) {
  return window.crypto.subtle.exportKey("jwk", publicKey);
}

export async function exportPrivateKeyJwk(privateKey) {
  return window.crypto.subtle.exportKey("jwk", privateKey);
}

export async function importPublicKey(jwk) {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

export async function importPrivateKey(jwk) {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

export function getStoredPrivateKeyJwk() {
  try {
    const raw = localStorage.getItem(PRIVATE_KEY_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredPublicKeyJwk() {
  try {
    const raw = localStorage.getItem(PUBLIC_KEY_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeKeyPair(privateJwk, publicJwk) {
  localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(privateJwk));
  localStorage.setItem(PUBLIC_KEY_STORAGE, JSON.stringify(publicJwk));
}

export function clearStoredKeys() {
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
  localStorage.removeItem(PUBLIC_KEY_STORAGE);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function encryptMessage(plaintext, rsaPublicKey) {
  const data = new TextEncoder().encode(plaintext);

  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data
  );

  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    rawAesKey
  );

  return {
    encryptedKey: bytesToB64(encryptedKey),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ciphertext),
  };
}

export async function decryptMessage({ encryptedKey, iv, ciphertext }, rsaPrivateKey) {
  const rawAesKey = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    b64ToBytes(encryptedKey)
  );

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(iv) },
    aesKey,
    b64ToBytes(ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}
