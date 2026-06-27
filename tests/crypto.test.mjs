import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKey, encryptJSON, decryptStore } from "../src/crypto.js";

test("encrypt → decrypt round trips", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey("clinic-pin-2026", salt);
  const store = await encryptJSON(key, salt, [{ name: "Sunita", age: "64" }]);
  const back = await decryptStore(key, store);
  assert.equal(back[0].name, "Sunita");
});

test("a wrong passphrase is rejected", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey("right-pass", salt);
  const store = await encryptJSON(key, salt, [{ name: "Sunita" }]);
  const wrong = await deriveKey("wrong-pass", salt);
  await assert.rejects(() => decryptStore(wrong, store));
});

test("tampered ciphertext is rejected (GCM integrity)", async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey("pass", salt);
  const store = await encryptJSON(key, salt, [{ name: "Sunita" }]);
  store.ct = store.ct.slice(0, -4) + (store.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  await assert.rejects(() => decryptStore(key, store));
});
