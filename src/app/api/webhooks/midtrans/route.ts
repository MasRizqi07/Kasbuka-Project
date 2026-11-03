import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMidtransSignature } from '@/lib/midtrans/signature';
import { calculateMidtransFee } from '@/lib/midtrans/fees';
import { LedgerService, withSeqRetry } from '@/lib/ledger/service';

/**
 * Mengubah string gross_amount dari Midtrans (misal "100000.00") ke integer BigInt.
 * Validasi ketat: "100000.00" valid, "100000.50" (desimal tidak nol) ditolak (PRD 4.3).
 */
export function parseGrossAmountToInt(grossAmountStr: string): bigint | null {
  if (typeof grossAmountStr !== 'string') return null;
  const parts = grossAmountStr.split('.');
  if (parts.length === 1) {
    if (!/^\d+$/.test(parts[0])) return null;
    return BigInt(parts[0]);
  }
  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[0])) return null;
    // Bagian pecahan wajib terdiri hanya dari angka nol ("00", "0", dll)
    if (!/^0+$/.test(parts[1])) return null;
    return BigInt(parts[0]);
  }
  return null;
}

export async function POST(request: Request) {
  // 1. Parse JSON. Gagal parse, balas 400.
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body request bukan JSON valid.' }, { status: 400 });
  }

  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  const statusCode = typeof body.status_code === 'string' ? body.status_code : '';
  const grossAmount = typeof body.gross_amount === 'string' ? body.gross_amount : '';
  const signatureKey = typeof body.signature_key === 'string' ? body.signature_key : '';
  const transactionStatus = typeof body.transaction_status === 'string' ? body.transaction_status : '';
  const fraudStatus = typeof body.fraud_status === 'string' ? body.fraud_status : '';
  const paymentType = typeof body.payment_type === 'string' ? body.payment_type : null;
  const settlementTime = typeof body.settlement_time === 'string' ? body.settlement_time : null;
  const transactionTime = typeof body.transaction_time === 'string' ? body.transaction_time : null;

  // 2. Verifikasi SHA512(order_id + status_code + gross_amount + ServerKey) pakai timingSafeEqual
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const isSignatureValid = verifyMidtransSignature({
    orderId,
    statusCode,
    grossAmount,
    serverKey,
    incomingSignature: signatureKey,
  });

  if (!isSignatureValid) {
    // Catat WebhookEvent(signatureValid=false, REJECTED), balas 401
    if (orderId) {
      await prisma.webhookEvent.create({
        data: {
          orderId,
          transactionStatus: transactionStatus || 'unknown',
          signatureValid: false,
          result: 'REJECTED',
        },
      });
    }
    return NextResponse.json({ error: 'Signature webhook tidak valid.' }, { status: 401 });
  }

  // 3. Cari Donation by orderId. Tidak ada, balas 404.
  const donation = await prisma.donation.findUnique({
    where: { orderId },
  });

  if (!donation) {
    return NextResponse.json({ error: 'Donasi tidak ditemukan.' }, { status: 404 });
  }

  // 4. Cocokkan nominal: ubah gross_amount ke integer lewat pemisahan string
  const parsedAmount = parseGrossAmountToInt(grossAmount);
  if (parsedAmount === null || parsedAmount !== donation.amount) {
    await prisma.webhookEvent.create({
      data: {
        orderId,
        transactionStatus,
        signatureValid: true,
        result: 'REJECTED',
      },
    });
    return NextResponse.json(
      { error: 'Nominal notifikasi tidak cocok atau memiliki desimal tidak nol.' },
      { status: 400 }
    );
  }

  // 5. Petakan status
  // - settlement, atau capture dengan fraud_status = accept -> proses sebagai PAID
  // - pending -> catat IGNORED, balas 200
  // - deny, cancel, failure -> FAILED. expire -> EXPIRED. Tanpa entri ledger.
  // - capture dengan challenge, refund, chargeback -> IGNORED.
  const isPaid =
    transactionStatus === 'settlement' ||
    (transactionStatus === 'capture' && fraudStatus === 'accept');

  if (transactionStatus === 'pending') {
    await prisma.webhookEvent.create({
      data: {
        orderId,
        transactionStatus,
        signatureValid: true,
        result: 'IGNORED',
      },
    });
    return NextResponse.json({ status: 'IGNORED' }, { status: 200 });
  }

  if (['deny', 'cancel', 'failure'].includes(transactionStatus)) {
    await prisma.donation.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    await prisma.webhookEvent.create({
      data: {
        orderId,
        transactionStatus,
        signatureValid: true,
        result: 'PROCESSED',
      },
    });
    return NextResponse.json({ status: 'FAILED' }, { status: 200 });
  }

  if (transactionStatus === 'expire') {
    await prisma.donation.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    await prisma.webhookEvent.create({
      data: {
        orderId,
        transactionStatus,
        signatureValid: true,
        result: 'PROCESSED',
      },
    });
    return NextResponse.json({ status: 'EXPIRED' }, { status: 200 });
  }

  if (!isPaid) {
    // Challenge, refund, chargeback -> tidak diproses otomatis, catat IGNORED
    await prisma.webhookEvent.create({
      data: {
        orderId,
        transactionStatus,
        signatureValid: true,
        result: 'IGNORED',
      },
    });
    return NextResponse.json({ status: 'IGNORED' }, { status: 200 });
  }

  // 6. Pemrosesan PAID dalam satu prisma.$transaction dibungkus withSeqRetry
  const feeResult = calculateMidtransFee(paymentType, donation.amount);
  const paidAt = settlementTime
    ? new Date(settlementTime)
    : transactionTime
    ? new Date(transactionTime)
    : new Date();

  try {
    const outcome = await withSeqRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Update bersyarat: hanya baris yang masih PENDING yang diubah
        const updateResult = await tx.donation.updateMany({
          where: { orderId, status: 'PENDING' },
          data: {
            status: 'PAID',
            paidAt,
            paymentType,
          },
        });

        // Jika count === 0: sudah pernah diproses sebelumnya (DUPLICATE)
        if (updateResult.count === 0) {
          await tx.webhookEvent.create({
            data: {
              orderId,
              transactionStatus,
              signatureValid: true,
              result: 'DUPLICATE',
            },
          });
          return { status: 200, result: 'DUPLICATE' };
        }

        // Tepat 1 baris diupdate: tambahkan entri ledger append-only
        await LedgerService.appendEntry(
          {
            campaignId: donation.campaignId,
            type: 'IN',
            source: 'MIDTRANS',
            amount: donation.amount,
            fee: feeResult.fee,
            feeSource: feeResult.feeSource,
            paymentType,
            donationId: donation.id,
            donorName: donation.donorName,
            isAnonymous: donation.isAnonymous,
            message: donation.message,
            occurredAt: paidAt,
          },
          tx
        );

        await tx.webhookEvent.create({
          data: {
            orderId,
            transactionStatus,
            signatureValid: true,
            result: 'PROCESSED',
          },
        });

        return { status: 200, result: 'PROCESSED' };
      });
    });

    return NextResponse.json(outcome, { status: 200 });
  } catch (err: unknown) {
    // Kalau appendEntry gagal, seluruh transaksi rollback dan donasi tetap PENDING.
    // Balas 500 supaya Midtrans mengirim ulang notifikasi.
    console.error('Webhook processing transaction failed, rollback occurred:', err);
    return NextResponse.json(
      { error: 'Gagal memproses transaksi ledger. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}

