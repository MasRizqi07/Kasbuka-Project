import { createHash, timingSafeEqual } from 'crypto';

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
 * Menggunakan crypto.timingSafeEqual pada Buffer setelah memastikan panjang sama (PRD 4.3).
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

  const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
  const incomingBuf = Buffer.from(incomingSignature, 'utf-8');

  if (expectedBuf.length !== incomingBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, incomingBuf);
}
