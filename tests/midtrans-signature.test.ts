import { describe, it, expect } from 'vitest';
import {
  computeMidtransSignature,
  verifyMidtransSignature,
} from '@/lib/midtrans/signature';

describe('Midtrans Signature Verification (Pure Function Unit Tests)', () => {
  const SERVER_KEY = 'SB-Mid-server-test-secret-key-12345';
  const ORDER_ID = 'KASBUKA-DON-1730000000000-XYZ';
  const STATUS_CODE = '200';
  const GROSS_AMOUNT = '50000.00';

  it('menghasilkan SHA-512 heksadesimal 128 karakter yang valid', () => {
    const signature = computeMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY);
    expect(signature).toHaveLength(128); // 512 bits = 64 bytes = 128 hex chars
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it('memvalidasi signature yang sah secara konsisten (mengembalikan true)', () => {
    const validSignature = computeMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY);

    const isValid = verifyMidtransSignature({
      orderId: ORDER_ID,
      statusCode: STATUS_CODE,
      grossAmount: GROSS_AMOUNT,
      serverKey: SERVER_KEY,
      incomingSignature: validSignature,
    });

    expect(isValid).toBe(true);
  });

  it('menolak (mengembalikan false) jika orderId dimanipulasi penyerang', () => {
    const validSignature = computeMidtransSignature(ORDER_ID, STATUS_CODE, GROSS_AMOUNT, SERVER_KEY);

    const isValid = verifyMidtransSignature({
      orderId: 'KASBUKA-DON-MANIPULATED',
      statusCode: STATUS_CODE,
      grossAmount: GROSS_AMOUNT,
      serverKey: SERVER_KEY,
      incomingSignature: validSignature,
    });

    expect(isValid).toBe(false);
  });

  it('menolak (mengembalikan false) jika status_code dimanipulasi (misal 201 jadi 200)', () => {
    const signatureFor201 = computeMidtransSignature(ORDER_ID, '201', GROSS_AMOUNT, SERVER_KEY);

    const isValid = verifyMidtransSignature({
      orderId: ORDER_ID,
      statusCode: '200', // Status dimanipulasi
      grossAmount: GROSS_AMOUNT,
      serverKey: SERVER_KEY,
      incomingSignature: signatureFor201,
    });

    expect(isValid).toBe(false);
  });

  it('menolak (mengembalikan false) jika gross_amount dimanipulasi (misal bayar 10.000 tapi klaim 100.000)', () => {
    const signatureFor10k = computeMidtransSignature(ORDER_ID, STATUS_CODE, '10000.00', SERVER_KEY);

    const isValid = verifyMidtransSignature({
      orderId: ORDER_ID,
      statusCode: STATUS_CODE,
      grossAmount: '100000.00', // Nominal dinaikkan
      serverKey: SERVER_KEY,
      incomingSignature: signatureFor10k,
    });

    expect(isValid).toBe(false);
  });

  it('menolak (mengembalikan false) jika ServerKey server tidak cocok dengan penandatangan', () => {
    const signatureWithWrongKey = computeMidtransSignature(
      ORDER_ID,
      STATUS_CODE,
      GROSS_AMOUNT,
      'SB-Mid-server-fake-key-99999'
    );

    const isValid = verifyMidtransSignature({
      orderId: ORDER_ID,
      statusCode: STATUS_CODE,
      grossAmount: GROSS_AMOUNT,
      serverKey: SERVER_KEY,
      incomingSignature: signatureWithWrongKey,
    });

    expect(isValid).toBe(false);
  });

  it('menolak dengan aman jika ada parameter kosong atau undefined', () => {
    expect(
      verifyMidtransSignature({
        orderId: '',
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        serverKey: SERVER_KEY,
        incomingSignature: 'some-sig',
      })
    ).toBe(false);

    expect(
      verifyMidtransSignature({
        orderId: ORDER_ID,
        statusCode: STATUS_CODE,
        grossAmount: GROSS_AMOUNT,
        serverKey: SERVER_KEY,
        incomingSignature: '',
      })
    ).toBe(false);
  });
});
