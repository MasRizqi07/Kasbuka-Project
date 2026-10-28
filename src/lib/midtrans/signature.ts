import { createHash } from 'crypto';

export interface VerifyMidtransSignatureParams {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  incomingSignature: string;
}

/**
 * Menghitung signature SHA-512 standar Midtrans:
 * SHA512(order_id + status_code + gross_amount + ServerKey)
 */
export function computeMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string
): string {
  const payload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  return createHash('sha512').update(payload).digest('hex');
}

/**
 * Memverifikasi keabsahan signature webhook notifikasi dari Midtrans.
 * Fungsi murni (pure function), bebas efek samping, aman konkurensi.
 * Mengembalikan boolean true jika sah, false jika dipalsukan/rusak.
 */
export function verifyMidtransSignature({
  orderId,
  statusCode,
  grossAmount,
  serverKey,
  incomingSignature,
}: VerifyMidtransSignatureParams): boolean {
  if (!orderId || !statusCode || !grossAmount || !serverKey || !incomingSignature) {
    return false;
  }

  const expectedSignature = computeMidtransSignature(orderId, statusCode, grossAmount, serverKey);

  // Perbandingan string waktu konstan untuk mencegah timing attack
  if (expectedSignature.length !== incomingSignature.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ incomingSignature.charCodeAt(i);
  }

  return mismatch === 0;
}
