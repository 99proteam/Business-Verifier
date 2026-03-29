const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sanitizeBase32(input: string) {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

function base32ToBytes(value: string) {
  const cleaned = sanitizeBase32(value);
  let bits = 0;
  let bitsCount = 0;
  const output: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    bits = (bits << 5) | idx;
    bitsCount += 5;
    if (bitsCount >= 8) {
      bitsCount -= 8;
      output.push((bits >> bitsCount) & 0xff);
    }
  }

  return new Uint8Array(output);
}

function counterToBytes(counter: number) {
  const output = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i -= 1) {
    output[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return output;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateRandomBase32Secret(length = 32) {
  const random = randomBytes(length);
  return Array.from(random, (value) => BASE32_ALPHABET[value % BASE32_ALPHABET.length]).join("");
}

export function generateBackupCodes(count = 8, size = 10) {
  return Array.from({ length: count }, () => {
    const random = randomBytes(size);
    const raw = Array.from(
      random,
      (value) => BACKUP_CODE_ALPHABET[value % BACKUP_CODE_ALPHABET.length],
    ).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function normalizeOtpCode(code: string) {
  return code.replace(/\s|-/g, "").trim();
}

async function hotp(secret: string, counter: number, digits = 6) {
  const keyBytes = base32ToBytes(secret);
  const message = counterToBytes(counter);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Crypto API is unavailable for OTP verification.");
  }
  const cryptoKey = await cryptoApi.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await cryptoApi.subtle.sign("HMAC", cryptoKey, message));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, "0");
}

export async function generateTotpCode(secret: string, now = Date.now(), period = 30, digits = 6) {
  const counter = Math.floor(now / 1000 / period);
  return hotp(secret, counter, digits);
}

export async function verifyTotpCode(payload: {
  secret: string;
  code: string;
  now?: number;
  period?: number;
  digits?: number;
  window?: number;
}) {
  const now = payload.now ?? Date.now();
  const period = payload.period ?? 30;
  const digits = payload.digits ?? 6;
  const allowedWindow = payload.window ?? 1;
  const normalized = normalizeOtpCode(payload.code);
  if (!/^\d{6,8}$/.test(normalized)) return false;

  const currentCounter = Math.floor(now / 1000 / period);
  for (let drift = -allowedWindow; drift <= allowedWindow; drift += 1) {
    const candidate = await hotp(payload.secret, currentCounter + drift, digits);
    if (candidate === normalized) return true;
  }
  return false;
}

export function normalizeBackupCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildOtpAuthUri(payload: {
  secret: string;
  accountLabel: string;
  issuer?: string;
}) {
  const issuer = payload.issuer?.trim() || "Business Verifier";
  const label = `${issuer}:${payload.accountLabel || "user"}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${payload.secret}&issuer=${encodeURIComponent(
    issuer,
  )}&algorithm=SHA1&digits=6&period=30`;
}
