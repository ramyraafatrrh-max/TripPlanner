/* secure.js - small encryption helpers (AES-256-GCM). The key is made on the phone and travels only inside the share link. */
const enc = new TextEncoder(), dec = new TextDecoder();

export class SecureError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const toB64u = b => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64u = s => fromB64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
export const newSecret = n => toB64u(crypto.getRandomValues(new Uint8Array(n)));

const cryptoKey = (k, usage) => crypto.subtle.importKey("raw", fromB64u(k), "AES-GCM", false, [usage]);

export async function encryptJSON(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(key, "encrypt"), enc.encode(JSON.stringify(obj))));
  return { app: "trip-pilot", v: 1, iv: toB64(iv), ct: toB64(ct) };
}
export async function decryptJSON(file, key) {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(file.iv) }, await cryptoKey(key, "decrypt"), fromB64(file.ct));
    return JSON.parse(dec.decode(pt));
  } catch (e) { throw new SecureError("badkey", "Could not read the shared progress. The link may be incomplete or from a different trip."); }
}
