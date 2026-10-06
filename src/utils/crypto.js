import crypto from 'crypto';

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text).trim()).digest('hex');
}

export function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function hmacSha256Hex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

export function hmacSha512Base64(key, data) {
  return crypto.createHmac('sha512', key).update(data).digest('base64');
}

export function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateOrderNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${randomHex}`;
}

export function generateTransactionId(prefix = 'TX') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${randomHex}`;
}
