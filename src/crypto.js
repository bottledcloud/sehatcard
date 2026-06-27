// At-rest encryption primitives: AES-256-GCM with a PBKDF2-derived key.
// Pure (Web Crypto only), no DOM — unit-tested in tests/crypto.test.mjs.
// There is no passphrase recovery by design; do not add a backdoor.

const SUB = crypto.subtle, te = new TextEncoder(), td = new TextDecoder();

export const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function deriveKey(pass, salt) {
  const base = await SUB.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return SUB.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Returns a serialisable store envelope: { v, salt, iv, ct } (all base64).
export async function encryptJSON(key, salt, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await SUB.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

// Throws on wrong key / tampered ciphertext (GCM auth tag fails).
export async function decryptStore(key, store) {
  const pt = await SUB.decrypt({ name: "AES-GCM", iv: ub64(store.iv) }, key, ub64(store.ct));
  return JSON.parse(td.decode(pt));
}
