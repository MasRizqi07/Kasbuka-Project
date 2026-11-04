/**
 * Mem-parse waktu notifikasi Midtrans (settlement_time, transaction_time)
 * Midtrans mengirimkan waktu dalam format "YYYY-MM-DD HH:mm:ss" dalam zona waktu WIB (UTC+07:00)
 * tanpa informasi offset eksplisit (Aturan 8.2 D).
 */
export function parseMidtransTime(timeStr: string | null | undefined): Date {
  if (!timeStr || typeof timeStr !== 'string') {
    return new Date();
  }
  const trimmed = timeStr.trim();

  // Pola format Midtrans: "2026-11-04 18:30:00" -> WIB (+07:00)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed.replace(' ', 'T')}+07:00`);
  }

  // Fallback jika format sudah memuat offset ISO atau format tanggal valid
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
