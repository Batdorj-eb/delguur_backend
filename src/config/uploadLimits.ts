/** Nginx `client_max_body_size`-аас ихгүйг сонгоно (анхдагч 25MB, дээд 100MB). */
const UPLOAD_CAP_BYTES = 100 * 1024 * 1024;

export function maxUploadBytes(): number {
  const fromBytes = process.env.MAX_FILE_SIZE?.trim();
  if (fromBytes && /^\d+$/.test(fromBytes)) {
    const n = parseInt(fromBytes, 10);
    if (n > 0) return Math.min(UPLOAD_CAP_BYTES, n);
  }
  const mb = parseInt(process.env.UPLOAD_MAX_FILE_MB || '25', 10);
  const safeMb = Number.isFinite(mb) ? Math.min(100, Math.max(1, mb)) : 25;
  return safeMb * 1024 * 1024;
}

export function maxUploadMb(): number {
  return Math.round(maxUploadBytes() / (1024 * 1024));
}

export function uploadLimitMessage(): string {
  return `Зургийн хэмжээ ${maxUploadMb()}MB-аас ихгүй байх ёстой.`;
}
